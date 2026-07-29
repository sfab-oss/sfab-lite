/**
 * Code host port — Git remotes for each app (repo SoT).
 *
 * Builds live on BuildStore. Cloudflare Artifacts is a future adapter behind
 * these seams; the product noun is always "code host" / "repo" / "build",
 * never "Artifacts".
 */

/** Minimal FS surface isomorphic-git / createGit need against a worktree. */
export interface GitWorkFs {
  readFile: (path: string) => Promise<string>;
  readFileBytes: (path: string) => Promise<Uint8Array>;
  writeFile: (path: string, content: string) => Promise<void>;
  writeFileBytes: (path: string, content: Uint8Array) => Promise<void>;
  appendFile: (path: string, content: string | Uint8Array) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  stat: (path: string) => Promise<{
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: Date;
    mode?: number;
  }>;
  lstat: (path: string) => Promise<{
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: Date;
    mode?: number;
  }>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  readdirWithFileTypes: (
    path: string
  ) => Promise<{ name: string; type: "file" | "directory" | "symlink" }[]>;
  rm: (
    path: string,
    options?: { recursive?: boolean; force?: boolean }
  ) => Promise<void>;
  cp: (
    src: string,
    dest: string,
    options?: { recursive?: boolean }
  ) => Promise<void>;
  mv: (src: string, dest: string) => Promise<void>;
  symlink: (target: string, linkPath: string) => Promise<void>;
  readlink: (path: string) => Promise<string>;
  realpath: (path: string) => Promise<string>;
  resolvePath: (base: string, path: string) => string;
  glob: (pattern: string) => Promise<string[]>;
}

export interface CodeHostRepo {
  remoteUrl: string;
  repoId: string;
}

export interface CodeHostCredentials {
  username: string;
  token: string;
}

export interface CodeHost {
  ensureRepo: (appId: string) => Promise<CodeHostRepo>;
  credentialsForAgent: (appId: string) => Promise<CodeHostCredentials>;
  tipSha: (appId: string, ref?: string) => Promise<string | null>;
  cloneTo: (
    appId: string,
    targetFs: GitWorkFs,
    dir?: string
  ) => Promise<{ sha: string | null }>;
  commitTree: (
    appId: string,
    files: Record<string, string>,
    message: string
  ) => Promise<{ sha: string }>;
  receivePush: (
    appId: string,
    sourceFs: GitWorkFs,
    opts?: { dir?: string; ref?: string }
  ) => Promise<{ advancedMain: boolean; sha: string | null }>;
  /** Checkout / archive the tree at `sha` from the bare repo. */
  readTreeAt: (
    appId: string,
    sha: string
  ) => Promise<Record<string, string> | null>;
}

export function remoteUrlFor(appId: string): string {
  return `https://code-host.internal/${encodeURIComponent(appId)}.git`;
}
