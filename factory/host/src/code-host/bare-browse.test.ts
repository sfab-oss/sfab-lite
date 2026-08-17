import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import { listPathsInBare, readFileInBare } from "./bare-browse.ts";
import type { GitWorkFs } from "./code-host.ts";

const AUTHOR = { name: "test", email: "test@example.com" };

async function copyTree(
  from: GitWorkFs,
  fromDir: string,
  to: GitWorkFs,
  toDir: string
): Promise<void> {
  if (!(await from.exists(fromDir))) {
    return;
  }
  const st = await from.lstat(fromDir);
  if (st.type === "file") {
    await to.writeFileBytes(toDir, await from.readFileBytes(fromDir));
    return;
  }
  await to.mkdir(toDir, { recursive: true });
  for (const name of await from.readdir(fromDir)) {
    if (name === "." || name === "..") {
      continue;
    }
    const src = fromDir === "/" ? `/${name}` : `${fromDir}/${name}`;
    const dest = toDir === "/" ? `/${name}` : `${toDir}/${name}`;
    await copyTree(from, src, to, dest);
  }
}

async function seedBareRepo(): Promise<{ bare: GitWorkFs; sha: string }> {
  const work = new InMemoryFs();
  const git = createGit(work, "/");
  await git.init({ defaultBranch: "main" });
  await work.mkdir("/src/nested", { recursive: true });
  await work.writeFile("/src/hello.ts", 'export const hello = "world";\n');
  await work.writeFile("/README.md", "# demo\n");
  await work.writeFile("/src/nested/deep.ts", "export const x = 1;\n");
  await git.add({ filepath: "." });
  const { oid } = await git.commit({ message: "init", author: AUTHOR });

  const bare = new InMemoryFs();
  await copyTree(work, "/.git/objects", bare, "/objects");
  await copyTree(work, "/.git/refs", bare, "/refs");
  await bare.writeFile("/HEAD", "ref: refs/heads/main\n");
  return { bare, sha: oid };
}

describe("bare-browse", () => {
  it("lists paths without requiring a worktree checkout", async () => {
    const { bare, sha } = await seedBareRepo();
    const paths = await listPathsInBare(bare, sha);
    assert.ok(paths);
    assert.deepEqual(paths, [
      "README.md",
      "src/hello.ts",
      "src/nested/deep.ts",
    ]);
  });

  it("reads one file blob by path", async () => {
    const { bare, sha } = await seedBareRepo();
    const content = await readFileInBare(bare, sha, "src/hello.ts");
    assert.equal(content, 'export const hello = "world";\n');
  });

  it("rejects path traversal", async () => {
    const { bare, sha } = await seedBareRepo();
    assert.equal(await readFileInBare(bare, sha, "../README.md"), null);
  });
});
