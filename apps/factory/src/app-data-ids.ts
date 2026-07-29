/**
 * AppDataDO idFromName keys — one data DO class, many serve targets.
 *
 * Reserved (not served yet): `${appId}:ws:…` for workspace / design board.
 */

export function liveDataId(appId: string): string {
  return `${appId}:live`;
}

export function prDataId(appId: string, prNumber: number): string {
  return `${appId}:pr:${prNumber}`;
}
