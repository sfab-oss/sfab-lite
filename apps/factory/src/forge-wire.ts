export type PrStatus = "open" | "merged" | "closed";
export type CheckRunStatus = "queued" | "in_progress" | "completed";
export type CheckConclusion = "success" | "failure" | "cancelled";

export interface PrRecord {
  id: string;
  appId: string;
  number: number;
  title: string;
  body: string | null;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  status: PrStatus;
  previewSha: string | null;
  mergedSha: string | null;
  mergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckRunRecord {
  id: string;
  appId: string;
  prId: string | null;
  sha: string;
  name: string;
  status: CheckRunStatus;
  conclusion: CheckConclusion | null;
  detail: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export function wirePr(pr: PrRecord) {
  return {
    id: pr.id,
    appId: pr.appId,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    headSha: pr.headSha,
    status: pr.status,
    previewSha: pr.previewSha,
    mergedSha: pr.mergedSha,
    mergedAt: pr.mergedAt?.toISOString() ?? null,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
  };
}

export function wireCheckRun(run: CheckRunRecord) {
  return {
    id: run.id,
    appId: run.appId,
    prId: run.prId,
    sha: run.sha,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    detail: run.detail,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}
