import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryFs } from "@cloudflare/shell";
import { createGit } from "@cloudflare/shell/git";
import type { GitWorkFs } from "./code-host.ts";
import { copyTree } from "./copy-tree.ts";
import { R2GitFs } from "./r2-git-fs.ts";
import { FakeR2Bucket } from "./test/fake-r2-bucket.ts";

const AUTHOR = { name: "test", email: "test@example.com" };

function asShellFs(fs: GitWorkFs) {
  return fs as unknown as Parameters<typeof createGit>[0];
}

async function listFiles(
  fs: GitWorkFs,
  dir: string
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  async function walk(path: string): Promise<void> {
    if (!(await fs.exists(path))) {
      return;
    }
    const st = await fs.lstat(path);
    if (st.type === "file") {
      out[path] = await fs.readFileBytes(path);
      return;
    }
    for (const name of await fs.readdir(path)) {
      if (name === "." || name === "..") {
        continue;
      }
      await walk(path === "/" ? `/${name}` : `${path}/${name}`);
    }
  }
  await walk(dir);
  return out;
}

function bytesEqual(
  a: Record<string, Uint8Array>,
  b: Record<string, Uint8Array>
): void {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  for (const [path, bytes] of Object.entries(a)) {
    assert.deepEqual(
      Uint8Array.from(bytes),
      Uint8Array.from(b[path] as Uint8Array)
    );
  }
}

describe("copyTree", () => {
  it("copies object bytes 1:1 onto R2 without ancestor markers", async () => {
    const work = new InMemoryFs() as unknown as GitWorkFs;
    const git = createGit(asShellFs(work), "/");
    await git.init({ defaultBranch: "main" });
    await work.writeFile("/src/hello.ts", "export const hello = 1;\n");
    await work.writeFile("/README.md", "# demo\n");
    await git.add({ filepath: "." });
    await git.commit({ message: "init", author: AUTHOR });

    const bucket = new FakeR2Bucket();
    const dest = new R2GitFs(bucket as unknown as R2Bucket, "repos/app");
    await copyTree(work, "/.git/objects", dest, "/objects");

    const fromFiles = await listFiles(work, "/.git/objects");
    const toFiles = await listFiles(dest, "/objects");
    const remap: Record<string, Uint8Array> = {};
    for (const [path, bytes] of Object.entries(fromFiles)) {
      remap[path.replace("/.git/objects", "/objects")] = bytes;
    }
    bytesEqual(remap, toFiles);
    assert.equal(Object.keys(toFiles).length, Object.keys(fromFiles).length);
    assert.equal(
      bucket.keys().some((k) => k.endsWith("/.gitkeep")),
      false
    );
  });

  it("mkdirs empty source dirs so isomorphic-git can readdir them", async () => {
    const from = new InMemoryFs() as unknown as GitWorkFs;
    await from.mkdir("/objects/pack", { recursive: true });
    await from.writeFile("/objects/ab/cdef", "blob");
    const bucket = new FakeR2Bucket();
    const dest = new R2GitFs(bucket as unknown as R2Bucket, "repos/app");
    await copyTree(from, "/objects", dest, "/objects");
    assert.equal((await dest.lstat("/objects/pack")).type, "directory");
    assert.deepEqual(await dest.readdir("/objects/pack"), []);
    assert.ok(bucket.keys().includes("repos/app/objects/pack/.gitkeep"));
    assert.equal(await dest.readFile("/objects/ab/cdef"), "blob");
  });

  it("copies R2 objects back into an in-memory git dir with equal bytes", async () => {
    const work = new InMemoryFs() as unknown as GitWorkFs;
    const git = createGit(asShellFs(work), "/");
    await git.init({ defaultBranch: "main" });
    await work.writeFile("/src/hello.ts", "export const hello = 1;\n");
    await git.add({ filepath: "." });
    await git.commit({ message: "init", author: AUTHOR });

    const bucket = new FakeR2Bucket();
    const dest = new R2GitFs(bucket as unknown as R2Bucket, "repos/app");
    await copyTree(work, "/.git/objects", dest, "/objects");

    const back = new InMemoryFs() as unknown as GitWorkFs;
    await copyTree(dest, "/objects", back, "/.git/objects");
    bytesEqual(
      await listFiles(work, "/.git/objects"),
      await listFiles(back, "/.git/objects")
    );
  });
});

describe("receivePush object-then-ref order", () => {
  it("writes every object before the ref", async () => {
    const work = new InMemoryFs() as unknown as GitWorkFs;
    const git = createGit(asShellFs(work), "/");
    await git.init({ defaultBranch: "main" });
    await work.writeFile("/a.txt", "a\n");
    await git.add({ filepath: "." });
    const { oid } = await git.commit({ message: "init", author: AUTHOR });

    const bucket = new FakeR2Bucket();
    const bare = new R2GitFs(bucket as unknown as R2Bucket, "repos/app");
    await copyTree(work, "/.git/objects", bare, "/objects");
    await bare.mkdir("/refs/heads", { recursive: true });
    await bare.writeFile("/refs/heads/main", `${oid}\n`);

    const objectPuts = bucket.puts.filter(
      (k) => k.includes("/objects/") && !k.endsWith("/.gitkeep")
    );
    const refPut = bucket.puts.find((k) => k.endsWith("/refs/heads/main"));
    assert.ok(objectPuts.length > 0);
    assert.ok(refPut);
    const lastObject = Math.max(
      ...objectPuts.map((k) => bucket.puts.indexOf(k))
    );
    assert.ok(lastObject < bucket.puts.indexOf(refPut));
  });
});
