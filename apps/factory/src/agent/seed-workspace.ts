import type { WorkspaceFsLike } from "@cloudflare/shell";
import { createR2CodeHost } from "../r2-code-host.js";

export const WORKSPACE_CLONED_KEY = "workspaceClonedFromCodeHost";

export const WORKSPACE_CLONE_PENDING = "pending";

const FAILED_PREFIX = "failed:";

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
  return host.cloneTo(
    appId,
    workspace as unknown as import("../code-host.js").GitWorkFs,
    "/"
  );
}
