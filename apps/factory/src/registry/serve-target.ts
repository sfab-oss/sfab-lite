/**
 * Serve / data identity for live, PR preview, and computer (workspace) pairs.
 *
 * One shape for LOADER + AppDataDO addressing. Never overload appId as
 * workspaceId.
 *
 * Pure string helpers — kept free of deeper imports so node:test can load
 * this file under `--experimental-strip-types`.
 */

export type ServeTarget =
  | { mode: "live"; appId: string }
  | { mode: "preview"; appId: string; prNumber: number }
  | { mode: "workspace"; workspaceId: string };

export function liveDataId(appId: string): string {
  return `${appId}:live`;
}

export function prDataId(appId: string, prNumber: number): string {
  return `${appId}:pr:${prNumber}`;
}

export function wsDataId(workspaceId: string): string {
  return `${workspaceId}:ws`;
}

export function serveId(target: ServeTarget): string {
  return target.mode === "workspace" ? target.workspaceId : target.appId;
}

export function dataIdForTarget(target: ServeTarget): string {
  if (target.mode === "workspace") {
    return wsDataId(target.workspaceId);
  }
  if (target.mode === "preview") {
    return prDataId(target.appId, target.prNumber);
  }
  return liveDataId(target.appId);
}

export function pathPrefixForTarget(target: ServeTarget): string {
  if (target.mode === "workspace") {
    return `/a/${encodeURIComponent(target.workspaceId)}/workspace`;
  }
  if (target.mode === "preview") {
    return `/a/${encodeURIComponent(target.appId)}/preview/${target.prNumber}`;
  }
  return `/a/${encodeURIComponent(target.appId)}`;
}

export function parseSeedTarget(
  deps: { appId: string; workspaceId: string },
  args: string[]
): ServeTarget | { error: string } {
  const live = args.includes("--live");
  const workspace = args.includes("--workspace");
  if (live && workspace) {
    return { error: "seed: use only one of --live or --workspace\n" };
  }
  if (live) {
    return { mode: "live", appId: deps.appId };
  }
  return { mode: "workspace", workspaceId: deps.workspaceId };
}
