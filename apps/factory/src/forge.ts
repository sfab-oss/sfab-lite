/**
 * Forge — PRs, platform-fixed checks/runs, merge → CD → live, preview builds.
 */
import { and, desc, eq, max } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import {
  ensureLiveMatchesMain,
  getLiveSha,
  runCdForSha,
  setPreviewSha,
} from "./cd.js";
import { createDb, type Db } from "./db/index.js";
import { checkRun, pullRequest } from "./db/schema.js";
import type {
  CheckConclusion,
  CheckRunRecord,
  CheckRunStatus,
  PrRecord,
  PrStatus,
} from "./forge-wire.js";
import { createR2CodeHost } from "./r2-code-host.js";

export type { CheckRunRecord, PrRecord, PrStatus } from "./forge-wire.js";
export { wireCheckRun, wirePr } from "./forge-wire.js";

const nextUlid = monotonicFactory();

function toPr(row: typeof pullRequest.$inferSelect): PrRecord {
  return {
    id: row.id,
    appId: row.appId,
    number: row.number,
    title: row.title,
    body: row.body ?? null,
    headBranch: row.headBranch,
    baseBranch: row.baseBranch,
    headSha: row.headSha,
    status: row.status as PrStatus,
    previewSha: row.previewSha ?? null,
    mergedSha: row.mergedSha ?? null,
    mergedAt: row.mergedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCheck(row: typeof checkRun.$inferSelect): CheckRunRecord {
  return {
    id: row.id,
    appId: row.appId,
    prId: row.prId ?? null,
    sha: row.sha,
    name: row.name,
    status: row.status as CheckRunStatus,
    conclusion: (row.conclusion as CheckConclusion | null) ?? null,
    detail: row.detail ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? null,
  };
}

async function nextPrNumber(db: Db, appId: string): Promise<number> {
  const rows = await db
    .select({ n: max(pullRequest.number) })
    .from(pullRequest)
    .where(eq(pullRequest.appId, appId));
  return (rows[0]?.n ?? 0) + 1;
}

export async function listPullRequests(
  env: Env,
  appId: string,
  opts?: { status?: PrStatus }
): Promise<PrRecord[]> {
  const db = createDb(env);
  const rows = opts?.status
    ? await db.query.pullRequest.findMany({
        where: and(
          eq(pullRequest.appId, appId),
          eq(pullRequest.status, opts.status)
        ),
        orderBy: [desc(pullRequest.number)],
      })
    : await db.query.pullRequest.findMany({
        where: eq(pullRequest.appId, appId),
        orderBy: [desc(pullRequest.number)],
      });
  return rows.map(toPr);
}

export async function getPullRequestByNumber(
  env: Env,
  appId: string,
  number: number
): Promise<PrRecord | null> {
  const db = createDb(env);
  const row = await db.query.pullRequest.findFirst({
    where: and(eq(pullRequest.appId, appId), eq(pullRequest.number, number)),
  });
  return row ? toPr(row) : null;
}

async function getPullRequestById(
  env: Env,
  appId: string,
  prId: string
): Promise<PrRecord | null> {
  const db = createDb(env);
  const row = await db.query.pullRequest.findFirst({
    where: and(eq(pullRequest.appId, appId), eq(pullRequest.id, prId)),
  });
  return row ? toPr(row) : null;
}

async function findOpenPrByHeadBranch(
  env: Env,
  appId: string,
  headBranch: string
): Promise<PrRecord | null> {
  const db = createDb(env);
  const row = await db.query.pullRequest.findFirst({
    where: and(
      eq(pullRequest.appId, appId),
      eq(pullRequest.headBranch, headBranch),
      eq(pullRequest.status, "open")
    ),
  });
  return row ? toPr(row) : null;
}

export type CreatePrResult =
  | { ok: true; pr: PrRecord; checkRun: CheckRunRecord }
  | { ok: false; error: string };

export async function createPullRequest(
  env: Env,
  appId: string,
  input: {
    title: string;
    body?: string | null;
    headBranch: string;
    baseBranch?: string;
  }
): Promise<CreatePrResult> {
  const headBranch = input.headBranch.trim();
  const baseBranch = (input.baseBranch ?? "main").trim() || "main";
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "title_required" };
  }
  if (!headBranch) {
    return { ok: false, error: "head_required" };
  }
  if (headBranch === baseBranch) {
    return { ok: false, error: "head_equals_base" };
  }
  if (baseBranch !== "main") {
    return { ok: false, error: "base_must_be_main" };
  }

  const host = createR2CodeHost(env);
  const headSha = await host.tipSha(appId, headBranch);
  if (!headSha) {
    return { ok: false, error: "head_branch_missing" };
  }
  const baseSha = await host.tipSha(appId, baseBranch);
  if (!baseSha) {
    return { ok: false, error: "base_branch_missing" };
  }

  const existing = await findOpenPrByHeadBranch(env, appId, headBranch);
  if (existing) {
    return { ok: false, error: "open_pr_exists" };
  }

  const db = createDb(env);
  const number = await nextPrNumber(db, appId);
  const id = `pr_${nextUlid()}`;
  const now = new Date();
  await db.insert(pullRequest).values({
    id,
    appId,
    number,
    title,
    body: input.body?.trim() || null,
    headBranch,
    baseBranch,
    headSha,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });

  const pr = await getPullRequestById(env, appId, id);
  if (!pr) {
    return { ok: false, error: "pr_insert_failed" };
  }
  const check = await startCheckRun(env, appId, {
    prId: pr.id,
    sha: headSha,
    name: "cd",
  });
  return { ok: true, pr, checkRun: check };
}

export async function listCheckRuns(
  env: Env,
  appId: string,
  opts?: { prId?: string; sha?: string; limit?: number }
): Promise<CheckRunRecord[]> {
  const db = createDb(env);
  const limit = opts?.limit ?? 50;
  let rows = await db.query.checkRun.findMany({
    where: eq(checkRun.appId, appId),
    orderBy: [desc(checkRun.createdAt)],
    limit: 200,
  });
  if (opts?.prId) {
    rows = rows.filter((r) => r.prId === opts.prId);
  }
  if (opts?.sha) {
    const shaPrefix = opts.sha;
    rows = rows.filter(
      (r) => r.sha === shaPrefix || r.sha.startsWith(shaPrefix)
    );
  }
  return rows.slice(0, limit).map(toCheck);
}

export async function getCheckRun(
  env: Env,
  appId: string,
  runId: string
): Promise<CheckRunRecord | null> {
  const db = createDb(env);
  const row = await db.query.checkRun.findFirst({
    where: and(eq(checkRun.appId, appId), eq(checkRun.id, runId)),
  });
  return row ? toCheck(row) : null;
}

async function insertCheckRun(
  env: Env,
  values: {
    appId: string;
    prId: string | null;
    sha: string;
    name: string;
    status: CheckRunStatus;
  }
): Promise<CheckRunRecord> {
  const db = createDb(env);
  const id = `run_${nextUlid()}`;
  const now = new Date();
  await db.insert(checkRun).values({
    id,
    appId: values.appId,
    prId: values.prId,
    sha: values.sha,
    name: values.name,
    status: values.status,
    createdAt: now,
    updatedAt: now,
  });
  const created = await getCheckRun(env, values.appId, id);
  if (!created) {
    throw new Error(`check_run_missing:${id}`);
  }
  return created;
}

async function completeCheckRun(
  env: Env,
  appId: string,
  runId: string,
  conclusion: CheckConclusion,
  detail?: unknown
): Promise<CheckRunRecord> {
  const db = createDb(env);
  const now = new Date();
  await db
    .update(checkRun)
    .set({
      status: "completed",
      conclusion,
      detail: detail == null ? null : JSON.stringify(detail),
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(checkRun.appId, appId), eq(checkRun.id, runId)));
  const completed = await getCheckRun(env, appId, runId);
  if (!completed) {
    throw new Error(`check_run_missing:${runId}`);
  }
  return completed;
}

/**
 * Create a check run and execute platform CD for the sha (build without live).
 * On success, sets PR + app preview_sha.
 */
async function startCheckRun(
  env: Env,
  appId: string,
  input: { prId: string | null; sha: string; name?: string }
): Promise<CheckRunRecord> {
  const run = await insertCheckRun(env, {
    appId,
    prId: input.prId,
    sha: input.sha,
    name: input.name ?? "cd",
    status: "in_progress",
  });

  const host = createR2CodeHost(env);
  const sourceFiles = await host.readTreeAt(appId, input.sha);
  if (!sourceFiles) {
    return await completeCheckRun(env, appId, run.id, "failure", {
      error: "tree_missing",
    });
  }

  const cd = await runCdForSha(env, appId, input.sha, sourceFiles, {
    advanceLive: false,
  });

  if (!cd.ok) {
    return await completeCheckRun(env, appId, run.id, "failure", {
      error: cd.error,
      detail: cd.detail,
    });
  }

  const completed = await completeCheckRun(env, appId, run.id, "success", {
    sha: cd.sha,
  });

  await setPreviewSha(env, appId, input.sha);
  if (input.prId) {
    const db = createDb(env);
    await db
      .update(pullRequest)
      .set({ previewSha: input.sha, updatedAt: new Date() })
      .where(eq(pullRequest.id, input.prId));
  }

  return completed;
}

export async function rerunCheckRun(
  env: Env,
  appId: string,
  runId: string
): Promise<CheckRunRecord | null> {
  const existing = await getCheckRun(env, appId, runId);
  if (!existing) {
    return null;
  }
  return startCheckRun(env, appId, {
    prId: existing.prId,
    sha: existing.sha,
    name: existing.name,
  });
}

/**
 * After a feature-branch push: refresh open PR head_sha and kick checks.
 */
export async function onBranchPushed(
  env: Env,
  appId: string,
  branch: string,
  sha: string | null
): Promise<CheckRunRecord | null> {
  if (!sha || branch === "main") {
    return null;
  }
  const pr = await findOpenPrByHeadBranch(env, appId, branch);
  if (!pr) {
    return null;
  }
  const db = createDb(env);
  await db
    .update(pullRequest)
    .set({ headSha: sha, updatedAt: new Date() })
    .where(eq(pullRequest.id, pr.id));
  return startCheckRun(env, appId, {
    prId: pr.id,
    sha,
    name: "cd",
  });
}

export type MergePrResult =
  | { ok: true; pr: PrRecord; liveSha: string }
  | { ok: false; error: string; detail?: unknown };

export async function mergePullRequest(
  env: Env,
  appId: string,
  number: number
): Promise<MergePrResult> {
  const pr = await getPullRequestByNumber(env, appId, number);
  if (!pr) {
    return { ok: false, error: "pr_not_found" };
  }
  if (pr.status !== "open") {
    return { ok: false, error: "pr_not_open" };
  }

  const checks = await listCheckRuns(env, appId, {
    prId: pr.id,
    sha: pr.headSha,
    limit: 20,
  });
  const latestForHead = checks.find((c) => c.sha === pr.headSha);
  if (latestForHead?.status !== "completed") {
    return { ok: false, error: "checks_pending" };
  }
  if (latestForHead.conclusion !== "success") {
    return { ok: false, error: "checks_failed" };
  }

  const host = createR2CodeHost(env);
  const headTip = await host.tipSha(appId, pr.headBranch);
  if (!headTip) {
    return { ok: false, error: "head_branch_missing" };
  }
  if (headTip !== pr.headSha) {
    const db = createDb(env);
    await db
      .update(pullRequest)
      .set({ headSha: headTip, updatedAt: new Date() })
      .where(eq(pullRequest.id, pr.id));
    return { ok: false, error: "head_moved" };
  }

  await host.updateRef(appId, "main", headTip);

  const live = await ensureLiveMatchesMain(env, appId);
  if (live.status === "cd_failed") {
    return {
      ok: false,
      error: "cd_failed",
      detail: { tip: live.tip, error: live.error, detail: live.detail },
    };
  }

  const liveSha =
    live.status === "updated"
      ? live.liveSha
      : ((await getLiveSha(env, appId)) ?? headTip);

  const db = createDb(env);
  const now = new Date();
  await db
    .update(pullRequest)
    .set({
      status: "merged",
      mergedSha: liveSha,
      mergedAt: now,
      updatedAt: now,
    })
    .where(eq(pullRequest.id, pr.id));

  const merged = await getPullRequestByNumber(env, appId, number);
  if (!merged) {
    return { ok: false, error: "pr_not_found" };
  }
  return { ok: true, pr: merged, liveSha };
}

export async function prDiffSummary(
  env: Env,
  appId: string,
  number: number
): Promise<
  | {
      ok: true;
      baseSha: string | null;
      headSha: string;
      changedPaths: string[];
    }
  | { ok: false; error: string }
> {
  const pr = await getPullRequestByNumber(env, appId, number);
  if (!pr) {
    return { ok: false, error: "pr_not_found" };
  }
  const host = createR2CodeHost(env);
  const baseSha = await host.tipSha(appId, pr.baseBranch);
  const headTree = await host.readTreeAt(appId, pr.headSha);
  if (!headTree) {
    return { ok: false, error: "head_tree_missing" };
  }
  const baseTree = baseSha ? await host.readTreeAt(appId, baseSha) : {};
  const paths = new Set([
    ...Object.keys(headTree),
    ...Object.keys(baseTree ?? {}),
  ]);
  const changedPaths: string[] = [];
  for (const path of [...paths].sort()) {
    if ((headTree[path] ?? null) !== (baseTree?.[path] ?? null)) {
      changedPaths.push(path);
    }
  }
  return {
    ok: true,
    baseSha,
    headSha: pr.headSha,
    changedPaths,
  };
}
