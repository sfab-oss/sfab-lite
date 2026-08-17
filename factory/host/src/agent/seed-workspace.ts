import type { FileStat, FsStat, WorkspaceFsLike } from "@cloudflare/shell";
import type { GitWorkFs } from "../code-host/code-host.js";
import { fsError } from "../code-host/fs-error.ts";
import { createR2CodeHost } from "../code-host/r2-code-host.js";

export const WORKSPACE_CLONED_KEY = "workspaceClonedFromCodeHost";

export const WORKSPACE_CLONE_PENDING = "pending";

const FAILED_PREFIX = "failed:";
const LEADING_SLASHES = /^\/+/;

export function isWorkspaceCloneReady(
  status: string | undefined
): status is string {
  return (
    status !== undefined &&
    status !== WORKSPACE_CLONE_PENDING &&
    !status.startsWith(FAILED_PREFIX)
  );
}

export function isWorkspaceClonePending(status: string | undefined): boolean {
  return status === WORKSPACE_CLONE_PENDING;
}

export function workspaceCloneFailureReason(
  status: string | undefined
): string | null {
  if (!status?.startsWith(FAILED_PREFIX)) {
    return null;
  }
  return status.slice(FAILED_PREFIX.length) || "clone failed";
}

export function workspaceCloneFailedMarker(reason: string): string {
  const trimmed = reason.replace(/\s+/g, " ").trim().slice(0, 400);
  return `${FAILED_PREFIX}${trimmed || "clone failed"}`;
}

function normalize(path: string): string {
  const parts = path.split("/").filter((p) => p && p !== ".");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return `/${out.join("/")}`;
}

function toFsStat(info: FileStat): FsStat {
  return {
    type: info.type,
    size: info.size,
    mtime: new Date(info.updatedAt),
  };
}

function workspaceAsGitWorkFs(workspace: WorkspaceFsLike): GitWorkFs {
  return {
    async readFile(path) {
      const value = await workspace.readFile(path);
      if (value == null) {
        throw fsError(path, "ENOENT");
      }
      return value;
    },
    async readFileBytes(path) {
      const value = await workspace.readFileBytes(path);
      if (value == null) {
        throw fsError(path, "ENOENT");
      }
      return value;
    },
    writeFile: (path, content) => workspace.writeFile(path, content),
    writeFileBytes: (path, content) => workspace.writeFileBytes(path, content),
    appendFile: async (path, content) => {
      if (typeof content === "string") {
        return workspace.appendFile(path, content);
      }
      const existing =
        (await workspace.readFileBytes(path)) ?? new Uint8Array();
      const merged = new Uint8Array(existing.length + content.length);
      merged.set(existing);
      merged.set(content, existing.length);
      return workspace.writeFileBytes(path, merged);
    },
    exists: (path) => workspace.exists(path),
    async stat(path) {
      const info = await workspace.stat(path);
      if (info == null) {
        throw fsError(path, "ENOENT");
      }
      return toFsStat(info);
    },
    async lstat(path) {
      const info = await workspace.lstat(path);
      if (info == null) {
        throw fsError(path, "ENOENT");
      }
      return toFsStat(info);
    },
    mkdir: (path, options) => workspace.mkdir(path, options),
    async readdir(path) {
      const entries = await workspace.readDir(path);
      return entries.map((entry) => entry.name);
    },
    async readdirWithFileTypes(path) {
      const entries = await workspace.readDir(path);
      return entries.map((entry) => ({ name: entry.name, type: entry.type }));
    },
    rm: (path, options) => workspace.rm(path, options),
    cp: (src, dest, options) => workspace.cp(src, dest, options),
    mv: (src, dest) => workspace.mv(src, dest),
    symlink: (target, linkPath) => workspace.symlink(target, linkPath),
    readlink: (path) => workspace.readlink(path),
    realpath: (path) => Promise.resolve(normalize(path)),
    resolvePath(base, path) {
      if (path.startsWith("/")) {
        return normalize(path);
      }
      return normalize(`${base}/${path}`);
    },
    async glob(pattern) {
      const entries = await workspace.glob(pattern);
      return entries.map((entry) => entry.path.replace(LEADING_SLASHES, "/"));
    },
  };
}

/**
 * Copy the app repo into AppAgent's shared workspace. Caller owns the
 * pending/ready/failed status machine — this only performs I/O.
 */
export async function cloneWorkspaceFromCodeHost(
  env: Env,
  workspace: WorkspaceFsLike,
  appId: string
): Promise<{ sha: string | null }> {
  const host = createR2CodeHost(env);
  await host.ensureRepo(appId);
  return host.cloneTo(appId, workspaceAsGitWorkFs(workspace), "/");
}
