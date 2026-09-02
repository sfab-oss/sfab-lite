import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import { artifactsCodeHost, createCodeHost } from "./artifacts-code-host.ts";
import { createFakeArtifacts } from "./test/fake-artifacts.ts";
import { FakeR2Bucket } from "./test/fake-r2-bucket.ts";
import { createTreeStore } from "./tree-store.ts";

const AUTHOR = { name: "test", email: "test@example.com" };
const MISSING_ARTIFACTS = /ARTIFACTS binding missing/;

function hostFromFake() {
  const fake = createFakeArtifacts();
  const bucket = new FakeR2Bucket();
  const trees = createTreeStore(bucket);
  const host = artifactsCodeHost({
    artifacts: fake.artifacts,
    trees,
    git: fake.git,
  });
  return { fake, bucket, trees, host };
}

describe("createCodeHost", () => {
  it("fails closed when ARTIFACTS is missing", () => {
    assert.throws(() => createCodeHost({} as Env), MISSING_ARTIFACTS);
  });
});

describe("artifactsCodeHost", () => {
  it("ensureRepo creates once and returns the remote without a token", async () => {
    const { fake, host } = hostFromFake();
    const first = await host.ensureRepo("app_1");
    const second = await host.ensureRepo("app_1");
    assert.equal(first.repoId, "app_1");
    assert.equal(first.remoteUrl, second.remoteUrl);
    assert.equal(
      first.remoteUrl,
      "https://artifacts.test/git/sfab-lite-apps/app_1"
    );
    assert.equal(first.remoteUrl.includes("art_v2_"), false);
    assert.deepEqual(fake.created, ["app_1"]);
  });

  it("commitTree pushes, caches the tree, and readTreeAt does not need a git fetch", async () => {
    const { fake, host, trees } = hostFromFake();
    const files = {
      "README.md": "# hi\n",
      "src/server.ts": "export const n = 1;\n",
    };
    const { sha } = await host.commitTree("app_1", files, "chore: seed");
    assert.equal(sha.length, 40);
    assert.equal(fake.tokensMinted > 0, true);
    const cached = await trees.get("app_1", sha);
    assert.deepEqual(cached, files);
    const read = await host.readTreeAt("app_1", sha);
    assert.deepEqual(read, files);
    assert.deepEqual(await host.listPathsAt("app_1", sha), [
      "README.md",
      "src/server.ts",
    ]);
    assert.equal(
      await host.readFileAt("app_1", sha, "src/server.ts"),
      files["src/server.ts"]
    );
    assert.equal(await host.tipSha("app_1", "main"), sha);
    assert.deepEqual(await host.listBranches("app_1"), ["main"]);
  });

  it("cloneTo materializes the tree and never writes a token into .git/config", async () => {
    const { host } = hostFromFake();
    const files = {
      "src/server.ts":
        "export function fetch() { return new Response('ok'); }\n",
      "README.md": "# app\n",
    };
    const { sha } = await host.commitTree("app_2", files, "chore: seed");
    const dest = new InMemoryFs();
    const cloned = await host.cloneTo("app_2", dest, "/");
    assert.equal(cloned.sha, sha);
    assert.equal(await dest.readFile("/src/server.ts"), files["src/server.ts"]);
    assert.equal(await dest.readFile("/README.md"), files["README.md"]);
    const config = await dest.readFile("/.git/config");
    assert.equal(config.includes("art_v2_"), false);
    assert.equal(config.includes("token"), false);
    assert.ok(config.includes("artifacts.test/git/sfab-lite-apps/app_2"));
  });

  it("receivePush updates a feature branch and caches that tree", async () => {
    const { host } = hostFromFake();
    const seed = { "src/a.ts": "export const a = 1;\n" };
    await host.commitTree("app_3", seed, "chore: seed");
    const work = new InMemoryFs();
    await host.cloneTo("app_3", work, "/");
    const git = createGit(work, "/");
    await git.branch({ name: "feat/x" });
    await git.checkout({ ref: "feat/x" });
    await work.writeFile("/src/b.ts", "export const b = 2;\n");
    await git.add({ filepath: "." });
    const { oid } = await git.commit({ message: "feat", author: AUTHOR });
    const pushed = await host.receivePush("app_3", work, {
      dir: "/",
      ref: "feat/x",
    });
    assert.equal(pushed.sha, oid);
    assert.equal(pushed.advancedMain, false);
    assert.equal(await host.tipSha("app_3", "feat/x"), oid);
    const tree = await host.readTreeAt("app_3", oid);
    assert.equal(tree?.["src/b.ts"], "export const b = 2;\n");
    assert.equal(tree?.["src/a.ts"], seed["src/a.ts"]);
  });

  it("updateRef fast-forwards main and isAncestor sees the parent", async () => {
    const { host } = hostFromFake();
    const { sha: base } = await host.commitTree(
      "app_4",
      { "a.ts": "1\n" },
      "base"
    );
    const work = new InMemoryFs();
    await host.cloneTo("app_4", work, "/");
    const git = createGit(work, "/");
    await git.branch({ name: "feat/ff" });
    await git.checkout({ ref: "feat/ff" });
    await work.writeFile("/a.ts", "2\n");
    await git.add({ filepath: "." });
    const { oid: head } = await git.commit({ message: "ff", author: AUTHOR });
    await host.receivePush("app_4", work, { dir: "/", ref: "feat/ff" });
    assert.equal(await host.isAncestor("app_4", base, head), true);
    const { previous } = await host.updateRef("app_4", "main", head);
    assert.equal(previous, base);
    assert.equal(await host.tipSha("app_4", "main"), head);
  });
});
