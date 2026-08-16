export interface CdStageTimings {
  lintMs?: number;
  buildMs?: number;
  checkMs?: number;
  checkAttempts?: number;
  schemaMs?: number;
  writeMs?: number;
}

export type CdStages = CdStageTimings & { totalMs: number };

export function finishCdStages(
  startedAt: number,
  timings: CdStageTimings,
  now: number = Date.now()
): CdStages {
  return { ...timings, totalMs: now - startedAt };
}

export function cdStagesLogLine(
  appId: string,
  sha: string,
  stages: CdStages
): string {
  return JSON.stringify({ cd: "stages", appId, sha, ...stages });
}

export function detailWithCdStages(
  detail: Record<string, unknown>,
  stages: CdStages | undefined
): Record<string, unknown> {
  if (!stages) {
    return detail;
  }
  return { ...detail, stages };
}
