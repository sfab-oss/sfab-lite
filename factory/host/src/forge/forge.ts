/**
 * Forge — PRs, platform-fixed checks/runs, merge → CD → live, preview builds.
 */
import { and, desc, eq, max } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import { createR2CodeHost } from "../code-host/r2-code-host.js";
import { createDb, type Db } from "../db/index.js";
import { checkRun, pullRequest } from "../db/schema.js";
import { prDataId } from "../registry/app-data-ids.js";
import { appDataStub } from "../registry/app-stub.js";
import {
  applyPreviewSchemaMigrations,
  ensureLiveMatchesMain,
  getLiveSha,
  runCdForSha,
} from "./cd.js";
import { detailWithCdStages } from "./stages.js";
import type {
  CheckConclusion,
  CheckRunRecord,
  CheckRunStatus,
  PrRecord,
  PrStatus,
} from "./wire.js";

export type { CheckRunRecord, PrRecord, PrStatus } from "./wire.js";
export { wireCheckRun, wirePr } from "./wire.js";

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

async function insertCompletedCheckRun(
  env: Env,
  values: {
    appId: string;
    prId: string | null;
    sha: string;
    name: string;
    conclusion: CheckConclusion;
    detail?: unknown;
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
    status: "completed",
    conclusion: values.conclusion,
    detail: values.detail == null ? null : JSON.stringify(values.detail),
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });
  const created = await getCheckRun(env, values.appId, id);
  if (!created) {
    throw new Error(`check_run_missing:${id}`);
  }
  return created;
}

/**
 * Run platform CD for a sha (build without live / without live AppDataDO
 * migrate) and record a completed check run. On success for a PR, also
 * migrates that PR's AppDataDO from the preview source. Checks are
 * synchronous — create/push/rerun return only after CD finishes.
 */
async function startCheckRun(
  env: Env,
  appId: string,
  input: { prId: string | null; sha: string; name?: string }
): Promise<CheckRunRecord> {
  const name = input.name ?? "cd";
  const host = createR2CodeHost(env);
  const sourceFiles = await host.readTreeAt(appId, input.sha);
  if (!sourceFiles) {
    return insertCompletedCheckRun(env, {
      appId,
      prId: input.prId,
      sha: input.sha,
      name,
      conclusion: "failure",
      detail: { error: "tree_missing" },
    });
  }

  const cd = await runCdForSha(env, appId, input.sha, sourceFiles, {
    advanceLive: false,
  });

  if (!cd.ok) {
    return insertCompletedCheckRun(env, {
      appId,
      prId: input.prId,
      sha: input.sha,
      name,
      conclusion: "failure",
      detail: detailWithCdStages(
        { error: cd.error, detail: cd.detail },
        cd.stages
      ),
    });
  }

  if (input.prId) {
    const db = createDb(env);
    const prRow = await db.query.pullRequest.findFirst({
      where: eq(pullRequest.id, input.prId),
      columns: { number: true, status: true },
    });
    // Closed/merged PRs must not resurrect a destroyed preview DO.
    if (prRow?.status === "open" && prRow.number != null) {
      const migrated = await applyPreviewSchemaMigrations(
        env,
        appId,
        prRow.number,
        sourceFiles
      );
      if (!migrated.ok) {
        return insertCompletedCheckRun(env, {
          appId,
          prId: input.prId,
          sha: input.sha,
          name,
          conclusion: "failure",
          detail: detailWithCdStages(
            {
              error: "preview_schema_bootstrap_failed",
              detail: migrated.error,
            },
            cd.stages
          ),
        });
      }
      await db
        .update(pullRequest)
        .set({ previewSha: input.sha, updatedAt: new Date() })
        .where(eq(pullRequest.id, input.prId));
    }
  }

  return insertCompletedCheckRun(env, {
    appId,
    prId: input.prId,
    sha: input.sha,
    name,
    conclusion: "success",
    detail: detailWithCdStages({ sha: cd.sha }, cd.stages),
  });
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

  const mainTip = await host.tipSha(appId, "main");
  if (mainTip) {
    const ff = await host.isAncestor(appId, mainTip, headTip);
    if (!ff) {
      return { ok: false, error: "not_fast_forward" };
    }
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
      previewSha: null,
      mergedSha: liveSha,
      mergedAt: now,
      updatedAt: now,
    })
    .where(eq(pullRequest.id, pr.id));

  await destroyPreviewData(env, appId, number);

  const merged = await getPullRequestByNumber(env, appId, number);
  if (!merged) {
    return { ok: false, error: "pr_not_found" };
  }
  return { ok: true, pr: merged, liveSha };
}

async function destroyPreviewData(
  env: Env,
  appId: string,
  prNumber: number
): Promise<void> {
  await appDataStub(env, prDataId(appId, prNumber))
    .destroy()
    .catch(() => undefined);
}

export type ClosePrResult =
  | { ok: true; pr: PrRecord }
  | { ok: false; error: string };

export async function closePullRequest(
  env: Env,
  appId: string,
  number: number
): Promise<ClosePrResult> {
  const pr = await getPullRequestByNumber(env, appId, number);
  if (!pr) {
    return { ok: false, error: "pr_not_found" };
  }
  if (pr.status !== "open") {
    return { ok: false, error: "pr_not_open" };
  }

  const db = createDb(env);
  const now = new Date();
  await db
    .update(pullRequest)
    .set({ status: "closed", previewSha: null, updatedAt: now })
    .where(eq(pullRequest.id, pr.id));

  await destroyPreviewData(env, appId, number);

  const closed = await getPullRequestByNumber(env, appId, number);
  if (!closed) {
    return { ok: false, error: "pr_not_found" };
  }
  return { ok: true, pr: closed };
}

export async function readTreeAtRef(
  env: Env,
  appId: string,
  ref: string
): Promise<
  | {
      ok: true;
      ref: string;
      sha: string;
      branches: string[];
      paths: string[];
    }
  | { ok: false; error: string }
> {
  const host = createR2CodeHost(env);
  const branches = await host.listBranches(appId);
  const sha = await host.tipSha(appId, ref);
  if (!sha) {
    return { ok: false, error: "ref_not_found" };
  }
  const paths = await host.listPathsAt(appId, sha);
  if (!paths) {
    return { ok: false, error: "tree_missing" };
  }
  return { ok: true, ref, sha, branches, paths };
}

export async function readFileAtSha(
  env: Env,
  appId: string,
  sha: string,
  path: string,
  ref?: string
): Promise<
  | { ok: true; ref: string; sha: string; path: string; content: string }
  | { ok: false; error: string }
> {
  const host = createR2CodeHost(env);
  const content = await host.readFileAt(appId, sha, path);
  if (content == null) {
    return { ok: false, error: "file_not_found" };
  }
  return { ok: true, ref: ref ?? sha, sha, path, content };
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
      files: {
        path: string;
        before: string | null;
        after: string | null;
      }[];
    }
  | { ok: false; error: string }
> {
  const pr = await getPullRequestByNumber(env, appId, number);
  if (!pr) {
    return { ok: false, error: "pr_not_found" };
  }
  const host = createR2CodeHost(env);
  const baseSha = await host.tipSha(appId, pr.baseBranch);
  const headPaths = await host.listPathsAt(appId, pr.headSha);
  if (!headPaths) {
    return { ok: false, error: "head_tree_missing" };
  }
  const basePaths = baseSha ? await host.listPathsAt(appId, baseSha) : [];
  const paths = new Set([...headPaths, ...(basePaths ?? [])]);
  const changedPaths: string[] = [];
  const files: {
    path: string;
    before: string | null;
    after: string | null;
  }[] = [];
  for (const path of [...paths].sort()) {
    const before =
      baseSha && basePaths ? await host.readFileAt(appId, baseSha, path) : null;
    const after = await host.readFileAt(appId, pr.headSha, path);
    if (before !== after) {
      changedPaths.push(path);
      files.push({ path, before, after });
    }
  }
  return {
    ok: true,
    baseSha,
    headSha: pr.headSha,
    changedPaths,
    files,
  };
}
