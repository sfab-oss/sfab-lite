import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R2GitFs } from "./r2-git-fs.ts";
import { FakeR2Bucket } from "./test/fake-r2-bucket.ts";

function fs(bucket = new FakeR2Bucket()) {
  return {
    bucket,
    git: new R2GitFs(bucket as unknown as R2Bucket, "repos/app"),
  };
}

describe("R2GitFs writeFileBytes", () => {
  it("puts the file once and does not mkdir ancestors", async () => {
    const { bucket, git } = fs();
    await git.writeFileBytes(
      "/objects/ab/cdef",
      new TextEncoder().encode("blob")
    );
    assert.deepEqual(bucket.keys(), ["repos/app/objects/ab/cdef"]);
    assert.deepEqual(bucket.puts, ["repos/app/objects/ab/cdef"]);
  });
});

describe("R2GitFs directory implied by children", () => {
  it("exists/lstat/readdir treat a prefix with files and no marker as a directory", async () => {
    const { git } = fs();
    await git.writeFileBytes(
      "/objects/ab/cdef",
      new TextEncoder().encode("blob")
    );

    assert.equal(await git.exists("/objects"), true);
    assert.equal(await git.exists("/objects/ab"), true);
    assert.equal((await git.lstat("/objects")).type, "directory");
    assert.equal((await git.lstat("/objects/ab")).type, "directory");
    assert.deepEqual(await git.readdir("/objects"), ["ab"]);
    assert.deepEqual(await git.readdir("/objects/ab"), ["cdef"]);
    assert.equal(await git.readFile("/objects/ab/cdef"), "blob");
  });
});

describe("R2GitFs mkdir markers", () => {
  it("explicit mkdir still writes a .gitkeep that readdir hides", async () => {
    const { bucket, git } = fs();
    await git.mkdir("/refs/tags", { recursive: true });
    assert.ok(bucket.keys().includes("repos/app/refs/tags/.gitkeep"));
    assert.deepEqual(await git.readdir("/refs"), ["tags"]);
    assert.deepEqual(await git.readdir("/refs/tags"), []);
    assert.equal((await git.lstat("/refs/tags")).type, "directory");
  });

  it("keeps an existing marker invisible next to real files", async () => {
    const { git } = fs();
    await git.mkdir("/objects/ab", { recursive: true });
    await git.writeFileBytes(
      "/objects/ab/cdef",
      new TextEncoder().encode("blob")
    );
    assert.deepEqual(await git.readdir("/objects"), ["ab"]);
    assert.deepEqual(await git.readdir("/objects/ab"), ["cdef"]);
  });
});

describe("R2GitFs listFilesUnder", () => {
  it("returns relative file paths from one prefix list and skips .gitkeep", async () => {
    const { git } = fs();
    await git.mkdir("/objects/pack", { recursive: true });
    await git.writeFileBytes("/objects/ab/one", new TextEncoder().encode("a"));
    await git.writeFileBytes("/objects/cd/two", new TextEncoder().encode("b"));
    const paths = await git.listFilesUnder("/objects");
    assert.deepEqual(paths.sort(), ["ab/one", "cd/two"]);
  });
});
