/**
 * Code host port — Git remotes for each app (repo SoT).
 *
 * Builds live on BuildStore. Cloudflare Artifacts is the vendor git
 * product behind this seam; the product noun is always "code host" /
 * "repo" / "build" / "forge", never "Artifacts".
 */

import type { FileSystem } from "@cloudflare/shell";

export type GitWorkFs = FileSystem;

export interface CodeHostRepo {
  remoteUrl: string;
  repoId: string;
}

export interface CodeHost {
  ensureRepo: (appId: string) => Promise<CodeHostRepo>;
  tipSha: (appId: string, ref?: string) => Promise<string | null>;
  /** Branch names under `refs/heads` (e.g. `main`, `feat/foo`). */
  listBranches: (appId: string) => Promise<string[]>;
  cloneTo: (
    appId: string,
    targetFs: GitWorkFs,
    dir?: string
  ) => Promise<{ sha: string | null }>;
  /** Update `.git` from the remote without rewriting the worktree. */
  fetchGitdir: (
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
  /** Point a branch ref at an existing object sha (e.g. FF merge). */
  updateRef: (
    appId: string,
    ref: string,
    sha: string
  ) => Promise<{ previous: string | null }>;
  /** True when `ancestorSha` is reachable from `descendantSha` (incl. equal). */
  isAncestor: (
    appId: string,
    ancestorSha: string,
    descendantSha: string
  ) => Promise<boolean>;
  /** Checkout / archive the tree at `sha` from the derived tree store. */
  readTreeAt: (
    appId: string,
    sha: string
  ) => Promise<Record<string, string> | null>;
  /** Path index at `sha` (trees only; no blob bodies). For Code-tab browse. */
  listPathsAt: (appId: string, sha: string) => Promise<string[] | null>;
  /** One file body at `sha`/`path`. For Code-tab open-file. */
  readFileAt: (
    appId: string,
    sha: string,
    path: string
  ) => Promise<string | null>;
}
