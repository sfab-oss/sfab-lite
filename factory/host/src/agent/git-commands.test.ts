import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import { gitShow } from "./git-show.ts";

const AUTHOR = { name: "test", email: "test@example.com" };

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
