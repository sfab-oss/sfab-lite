export interface CreateStageTimings {
  ensureRepoMs?: number;
  commitTreeMs?: number;
  cdMs?: number;
  settleMs?: number;
}

export type CreateStages = CreateStageTimings & {
  totalMs: number;
  startedAt: string;
  finishedAt: string;
};

export function finishCreateStages(
  startedAtMs: number,
  timings: CreateStageTimings,
  now: number = Date.now()
): CreateStages {
  return {
    ...timings,
    totalMs: now - startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(now).toISOString(),
  };
}

export function createStagesLogLine(
  appId: string,
  stages: CreateStages
): string {
  return JSON.stringify({ create: "stages", appId, ...stages });
}
