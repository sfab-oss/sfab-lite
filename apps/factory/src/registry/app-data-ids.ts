/**
 * AppDataDO idFromName keys — one data DO class, many serve targets.
 *
 * Workspace WIP serve is keyed by workspaceId (`ws_…:ws`).
 */

export function liveDataId(appId: string): string {
  return `${appId}:live`;
}

export function prDataId(appId: string, prNumber: number): string {
  return `${appId}:pr:${prNumber}`;
}

export function wsDataId(workspaceId: string): string {
  return `${workspaceId}:ws`;
}
