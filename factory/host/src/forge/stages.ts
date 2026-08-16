export interface CdStageTimings {
  buildMs?: number;
  checkAttempts?: number;
  schemaMs?: number;
  writeMs?: number;
}

export interface CreateStageTimings {
  ensureRepoMs?: number;
  commitTreeMs?: number;
  cdMs?: number;
  settleMs?: number;
}

export interface StageBounds {
  totalMs: number;
  startedAt: string;
  finishedAt: string;
}

export type CdStages = CdStageTimings & StageBounds;
export type CreateStages = CreateStageTimings & StageBounds;

export function finishStages<T extends object>(
  startedAt: number,
  timings: T,
  now: number = Date.now()
): T & StageBounds {
  return {
    ...timings,
    totalMs: now - startedAt,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(now).toISOString(),
  };
}

export function stagesLogLine<T extends object>(
  kind: "cd" | "create",
  id: string,
  stages: T
): string {
  return JSON.stringify({ [kind]: "stages", appId: id, ...stages });
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
