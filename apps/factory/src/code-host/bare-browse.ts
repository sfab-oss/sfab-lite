import { listFiles, readBlob } from "isomorphic-git";
import type { GitWorkFs } from "./code-host.js";

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

function fsError(path: string, cause?: unknown): Error & { code: string } {
  if (
    cause instanceof Error &&
    "code" in cause &&
    typeof (cause as { code: unknown }).code === "string"
  ) {
    return cause as Error & { code: string };
  }
  const err = new Error(
    cause instanceof Error ? cause.message : `ENOENT: ${path}`
  ) as Error & { code: string };
  err.code = "ENOENT";
  return err;
}

function readOnlyError(op: string): Error & { code: string } {
  const err = new Error(
    `EROFS: ${op} not supported on bare browse fs`
  ) as Error & {
    code: string;
  };
  err.code = "EROFS";
  return err;
}

/**
 * isomorphic-git's FileSystem binder requires write/unlink/mkdir/rmdir/symlink
 * at construct time even for listFiles/readBlob. Stub those; keep the read
 * surface the object walk actually uses.
 */
function createGitFs(fs: GitWorkFs) {
  return {
    promises: {
      async readFile(
        path: string,
        options?: { encoding?: string } | string
      ): Promise<Uint8Array | string> {
        const encoding =
          typeof options === "string" ? options : options?.encoding;
        try {
          if (encoding === "utf8" || encoding === "utf-8") {
            return await fs.readFile(path);
          }
          return await fs.readFileBytes(path);
        } catch (err) {
          throw fsError(path, err);
        }
      },

      writeFile(): Promise<void> {
        return Promise.reject(readOnlyError("writeFile"));
      },

      unlink(): Promise<void> {
        return Promise.reject(readOnlyError("unlink"));
      },

      readdir(path: string): Promise<string[]> {
        return fs.readdir(path);
      },

      mkdir(): Promise<void> {
        return Promise.reject(readOnlyError("mkdir"));
      },

      rmdir(): Promise<void> {
        return Promise.reject(readOnlyError("rmdir"));
      },

      async stat(path: string): Promise<GitStat> {
        try {
          return new GitStat(await fs.stat(path));
        } catch (err) {
          throw fsError(path, err);
        }
      },

      async lstat(path: string): Promise<GitStat> {
        try {
          return new GitStat(await fs.lstat(path));
        } catch (err) {
          throw fsError(path, err);
        }
      },

      async readlink(path: string): Promise<string> {
        try {
          return await fs.readlink(path);
        } catch (err) {
          throw fsError(path, err);
        }
      },

      symlink(): Promise<void> {
        return Promise.reject(readOnlyError("symlink"));
      },
    },
  };
}

/**
 * List file paths at a commit against a bare repo FS (objects/refs at root).
 * Walks trees only — does not materialize blob contents.
 */
export async function listPathsInBare(
  bare: GitWorkFs,
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
  bare: GitWorkFs,
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
