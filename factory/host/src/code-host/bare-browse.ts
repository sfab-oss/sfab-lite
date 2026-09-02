import type { FileSystem } from "@cloudflare/shell";
import { listFiles, readBlob } from "isomorphic-git";
import { fsError } from "./fs-error.ts";

const BARE = { dir: "/", gitdir: "/" } as const;
const LEADING_SLASHES = /^\/+/;

class GitStat {
  type: "file" | "directory" | "symlink";
  size: number;
  mtime: Date;
  mtimeMs: number;
  ctimeMs: number;
  mode: number;
  ino = 0;
  uid = 0;
  gid = 0;
  dev = 0;

  constructor(stat: {
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: Date;
    mode?: number;
  }) {
    this.type = stat.type;
    this.size = stat.size;
    this.mtime = stat.mtime;
    this.mtimeMs = stat.mtime.getTime();
    this.ctimeMs = this.mtimeMs;
    this.mode = defaultMode(stat.type, stat.mode);
  }

  isFile() {
    return this.type === "file";
  }

  isDirectory() {
    return this.type === "directory";
  }

  isSymbolicLink() {
    return this.type === "symlink";
  }
}

function defaultMode(
  type: "file" | "directory" | "symlink",
  mode?: number
): number {
  if (mode != null) {
    return mode;
  }
  if (type === "directory") {
    return 0o4_0755;
  }
  if (type === "symlink") {
    return 0o12_0000;
  }
  return 0o10_0644;
}

async function withErrno<T>(path: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw fsError(path, "ENOENT", err);
  }
}

export function createGitFs(fs: FileSystem) {
  return {
    promises: {
      readFile(
        path: string,
        options?: { encoding?: string } | string
      ): Promise<Uint8Array | string> {
        const encoding =
          typeof options === "string" ? options : options?.encoding;
        return withErrno(path, async () => {
          if (encoding === "utf8" || encoding === "utf-8") {
            return await fs.readFile(path);
          }
          return await fs.readFileBytes(path);
        });
      },

      writeFile(path: string, data: Uint8Array | string): Promise<void> {
        return withErrno(path, async () => {
          if (typeof data === "string") {
            await fs.writeFile(path, data);
            return;
          }
          await fs.writeFileBytes(path, data);
        });
      },

      unlink(path: string): Promise<void> {
        return withErrno(path, () => fs.rm(path));
      },

      readdir(path: string): Promise<string[]> {
        return withErrno(path, () => fs.readdir(path));
      },

      mkdir(path: string): Promise<void> {
        return withErrno(path, () => fs.mkdir(path, { recursive: true }));
      },

      rmdir(path: string): Promise<void> {
        return withErrno(path, () => fs.rm(path));
      },

      stat(path: string): Promise<GitStat> {
        return withErrno(path, async () => new GitStat(await fs.stat(path)));
      },

      lstat(path: string): Promise<GitStat> {
        return withErrno(path, async () => new GitStat(await fs.lstat(path)));
      },

      readlink(path: string): Promise<string> {
        return withErrno(path, () => fs.readlink(path));
      },

      symlink(target: string, path: string): Promise<void> {
        return withErrno(path, () => fs.symlink(target, path));
      },
    },
  };
}

/**
 * List file paths at a commit against a bare repo FS (objects/refs at root).
 * Walks trees only — does not materialize blob contents.
 */
export async function listPathsInBare(
  bare: FileSystem,
  sha: string
): Promise<string[] | null> {
  const fs = createGitFs(bare);
  try {
    const paths = await listFiles({ fs, ...BARE, ref: sha });
    return paths.sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

/**
 * Read one file blob at a commit against a bare repo FS.
 */
export async function readFileInBare(
  bare: FileSystem,
  sha: string,
  filepath: string
): Promise<string | null> {
  const normalized = filepath.replace(LEADING_SLASHES, "");
  if (!normalized || normalized.includes("..")) {
    return null;
  }
  const fs = createGitFs(bare);
  try {
    const { blob } = await readBlob({
      fs,
      ...BARE,
      oid: sha,
      filepath: normalized,
    });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}
