/**
 * AppDataDO idFromName keys — one data DO class, many serve targets.
 *
 * `${appId}:ws:…` is workspace WIP serve (Package M may add more slots later).
 */

export function liveDataId(appId: string): string {
  return `${appId}:live`;
}

export function prDataId(appId: string, prNumber: number): string {
  return `${appId}:pr:${prNumber}`;
}

export function wsDataId(appId: string, slot = "default"): string {
  return `${appId}:ws:${slot}`;
}
