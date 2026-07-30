import { listFiles, readBlob } from "isomorphic-git";
import type { GitWorkFs } from "./code-host.js";

const BARE = { dir: "/", gitdir: "/" } as const;
const PARENT_SEGMENT = /\/[^/]+$/;
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

      async writeFile(path: string, data: string | Uint8Array): Promise<void> {
        const parent = path.replace(PARENT_SEGMENT, "");
        if (parent && parent !== "/" && parent !== path) {
          try {
            await fs.mkdir(parent, { recursive: true });
          } catch {
            // already exists
          }
        }
        if (typeof data === "string") {
          await fs.writeFile(path, data);
        } else {
          await fs.writeFileBytes(path, data);
        }
      },

      async unlink(path: string): Promise<void> {
        try {
          await fs.rm(path);
        } catch (err) {
          throw fsError(path, err);
        }
      },

      readdir(path: string): Promise<string[]> {
        return fs.readdir(path);
      },

      async mkdir(
        path: string,
        mode?: number | { recursive?: boolean }
      ): Promise<void> {
        const recursive = typeof mode === "object" ? mode.recursive : false;
        await fs.mkdir(path, { recursive });
      },

      async rmdir(path: string): Promise<void> {
        await fs.rm(path);
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

      async symlink(target: string, path: string): Promise<void> {
        await fs.symlink(target, path);
      },

      async chmod(_path: string, _mode: number): Promise<void> {
        // isomorphic-git requires chmod; bare browse is read-only.
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
