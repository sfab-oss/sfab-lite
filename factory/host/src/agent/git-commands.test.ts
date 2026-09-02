import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import {
  InMemoryFs as BashInMemoryFs,
  type CommandContext,
  type IFileSystem,
} from "just-bash";
import { runGitCommand } from "./git-commands.ts";
import { gitShow } from "./git-show.ts";

const AUTHOR = { name: "test", email: "test@example.com" };
const SERVER = 'export function fetch() { return new Response("ok"); }\n';
const STOCK = "export const n = 1;\n";

async function seedWork(): Promise<{
  fs: InMemoryFs;
  oid: string;
}> {
  const fs = new InMemoryFs();
  const git = createGit(fs, "/");
  await git.init({ defaultBranch: "main" });
  await fs.mkdir("/src", { recursive: true });
  await fs.writeFile("/src/hello.ts", 'export const hello = "world";\n');
  await fs.writeFile("/README.md", "# demo\n");
  await git.add({ filepath: "." });
  const { oid } = await git.commit({ message: "init", author: AUTHOR });
  return { fs, oid };
}

function sparseCtx(fs: IFileSystem): CommandContext {
  return { fs, cwd: "/", env: new Map(), stdin: "" } as CommandContext;
}

async function copyDir(
  from: InMemoryFs,
  to: IFileSystem,
  dir: string
): Promise<void> {
  const names = await from.readdir(dir);
  for (const name of names) {
    const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
    const st = await from.lstat(path);
    if (st.type === "directory") {
      await to.mkdir(path, { recursive: true });
      await copyDir(from, to, path);
    } else {
      await to.writeFile(path, await from.readFileBytes(path));
    }
  }
}

describe("git show", () => {
  it("prints HEAD commit metadata", async () => {
    const { fs, oid } = await seedWork();
    const result = await gitShow(fs, []);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes(`commit ${oid}`));
    assert.ok(result.stdout.includes("Author: test <test@example.com>"));
    assert.ok(result.stdout.includes("init"));
  });

  it("prints a named rev", async () => {
    const { fs, oid } = await seedWork();
    const result = await gitShow(fs, [oid]);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes(`commit ${oid}`));
  });

  it("prints a file at a rev", async () => {
    const { fs } = await seedWork();
    const result = await gitShow(fs, ["HEAD:src/hello.ts"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'export const hello = "world";\n');
  });

  it("fails on a missing path", async () => {
    const { fs } = await seedWork();
    const result = await gitShow(fs, ["HEAD:nope.ts"]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("not in"));
  });

  it("fails on an unknown revision", async () => {
    const { fs } = await seedWork();
    const result = await gitShow(fs, [
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    ]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("unknown revision"));
  });

  it("refuses path traversal", async () => {
    const { fs } = await seedWork();
    const result = await gitShow(fs, ["HEAD:../README.md"]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("invalid path"));
  });

  it("refuses flags", async () => {
    const { fs } = await seedWork();
    const result = await gitShow(fs, ["-s"]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("flags are not supported"));
  });

  it("refuses binary blobs", async () => {
    const fs = new InMemoryFs();
    const git = createGit(fs, "/");
    await git.init({ defaultBranch: "main" });
    await fs.writeFileBytes("/blob.bin", new Uint8Array([0x00, 0x01, 0x02]));
    await git.add({ filepath: "." });
    await git.commit({ message: "bin", author: AUTHOR });
    const result = await gitShow(fs, ["HEAD:blob.bin"]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes("binary file"));
  });
});

describe("runGitCommand workspace FS", () => {
  it("does not treat unread seed files as deleted on a sparse bash overlay", async () => {
    const workspace = new InMemoryFs();
    const git = createGit(workspace, "/");
    await git.init({ defaultBranch: "main" });
    await workspace.mkdir("/src", { recursive: true });
    await workspace.writeFile("/src/server.ts", SERVER);
    await git.add({ filepath: "." });
    await git.commit({ message: "init", author: AUTHOR });
    await workspace.writeFile("/src/stock.ts", STOCK);

    const overlay = new BashInMemoryFs();
    await copyDir(workspace, overlay, "/.git");
    await overlay.mkdir("/src", { recursive: true });
    await overlay.writeFile("/src/stock.ts", STOCK);

    const deps = {
      env: {} as unknown as Env,
      appId: "app_test",
      workspaceFs: workspace,
    };
    const ctx = sparseCtx(overlay);

    const status = await runGitCommand(deps, ["status"], ctx);
    assert.equal(status.exitCode, 0, status.stderr);
    assert.equal(status.stdout.includes("src/server.ts"), false, status.stdout);
    assert.ok(status.stdout.includes("src/stock.ts"), status.stdout);

    const add = await runGitCommand(deps, ["add", "."], ctx);
    assert.equal(add.exitCode, 0, add.stderr);
    const commit = await runGitCommand(
      deps,
      ["commit", "-m", "add stock"],
      ctx
    );
    assert.equal(commit.exitCode, 0, commit.stderr);

    const show = await runGitCommand(deps, ["show", "HEAD:src/server.ts"], ctx);
    assert.equal(show.exitCode, 0, show.stderr);
    assert.equal(show.stdout, SERVER);
  });
});
