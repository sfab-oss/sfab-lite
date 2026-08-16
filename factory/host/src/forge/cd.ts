/**
 * Minimal CD: lint → compile → check → schema → write build → set live_sha.
 *
 * Triggered on app create (initial main) and when main advances (PR merge).
 */
import {
  type CheckResponse,
  type CheckResult,
  type LintMode,
  type LintResult,
  lintPasses,
} from "@sfab-lite/core";
import { build } from "@sfab-lite/verbs/build";
import { type OverlaidTree, overlayFormatFiles } from "@sfab-lite/verbs/format";
import { eq } from "drizzle-orm";
import { appBuildFromCompile } from "../code-host/app-image.js";
import { createR2BuildStore } from "../code-host/r2-build-store.js";
import { createR2CodeHost } from "../code-host/r2-code-host.js";
import { createDb } from "../db/index.js";
import { app as appTable } from "../db/schema.js";
import { publishOrgEvent } from "../org-events.js";
import { prDataId } from "../registry/app-data-ids.js";
import { collectMigrations } from "../registry/app-migrations.js";
import { getAppOrganizationId } from "../registry/app-registry.js";
import {
  type AppDataStub,
  appDataStub,
  liveAppDataStub,
} from "../registry/app-stub.js";
import { diffSchema } from "../schema/schema-ddl.js";
import { probeSchema } from "../schema/schema-probe.js";
import { latestSnapshot } from "../schema/schema-snapshots.js";
import {
  type CdStages,
  type CdStageTimings,
  cdStagesLogLine,
  finishCdStages,
} from "./cd-stages.js";

export function checkPasses(body: CheckResponse | null): body is CheckResult {
  if (!body?.ok) {
    return false;
  }
  return body.diagnosticCount === 0;
}

function serviceHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (env.ADMIN_TOKEN) {
    h["X-Admin-Token"] = env.ADMIN_TOKEN;
  }
  return h;
}

export async function callLint(
  env: Env,
  appId: string,
  files: Record<string, string>,
  mode: LintMode = "lint"
): Promise<{ http: number; wallMs: number; body: LintResult | null }> {
  const t0 = Date.now();
  const res = await env.LINT.fetch(
    new Request("https://lint-worker/lint", {
      method: "POST",
      headers: serviceHeaders(env),
      body: JSON.stringify({ appId, files, mode }),
    })
  );
  const body = (await res.json().catch(() => null)) as LintResult | null;
  return { http: res.status, wallMs: Date.now() - t0, body };
}

const CHECK_ATTEMPTS = 2;
const CHECK_RETRY_DELAY_MS = 300;

export async function callCheck(
  env: Env,
  appId: string,
  files: Record<string, string>,
  forceCold = false
): Promise<{
  http: number;
  wallMs: number;
  body: CheckResponse | null;
  attempts: number;
}> {
  const t0 = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= CHECK_ATTEMPTS; attempt++) {
    try {
      const res = await env.CHECK.fetch(
        new Request("https://check-worker/check", {
          method: "POST",
          headers: serviceHeaders(env),
          body: JSON.stringify({
            appId,
            files,
            manifest: overlayFormatFiles(files).manifest,
            forceCold,
          }),
        })
      );
      const body = (await res.json().catch(() => null)) as CheckResponse | null;
      return {
        http: res.status,
        wallMs: Date.now() - t0,
        body,
        attempts: attempt,
      };
    } catch (e) {
      lastError = e;
      if (attempt < CHECK_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, CHECK_RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

interface SchemaGateFailure {
  error:
    | "schema_migration_missing"
    | "schema_unsafe"
    | "schema_probe_failed"
    | "schema_snapshot_unreadable"
    | "schema_history_changed";
  message: string;
  detail: unknown;
}

async function validateSchema(
  env: Env,
  files: Record<string, string>
): Promise<SchemaGateFailure | null> {
  const probe = await probeSchema(env, files);
  if (!probe.ok) {
    return {
      error: "schema_probe_failed",
      message: probe.error,
      detail: { probeMs: probe.ms },
    };
  }

  let diff: ReturnType<typeof diffSchema>;
  try {
    diff = diffSchema(latestSnapshot(files), probe.snapshot);
  } catch (cause) {
    return {
      error: "schema_snapshot_unreadable",
      message: cause instanceof Error ? cause.message : String(cause),
      detail: null,
    };
  }

  if (diff.blocking.length > 0) {
    return {
      error: "schema_unsafe",
      message:
        "This schema change cannot be applied without losing data. Migrate it by hand, or restore the removed columns and tables.",
      detail: { blocking: diff.blocking },
    };
  }

  if (diff.statements.length > 0) {
    return {
      error: "schema_migration_missing",
      message:
        "The schema declares tables or columns no migration creates. Run `pnpm db:generate` to write one, then deploy again.",
      detail: { pending: diff.additive, statements: diff.statements },
    };
  }

  return null;
}

async function applySchemaMigrations(
  files: Record<string, string>,
  dataStub: AppDataStub
): Promise<SchemaGateFailure | null> {
  const migrations = collectMigrations(files);
  if (migrations.length === 0) {
    return null;
  }
  try {
    await dataStub.bootstrap(migrations);
  } catch (cause) {
    return {
      error: "schema_history_changed",
      message: cause instanceof Error ? cause.message : String(cause),
      detail: null,
    };
  }
  return null;
}

async function applyLiveSchemaMigrations(
  env: Env,
  appId: string,
  files: Record<string, string>
): Promise<SchemaGateFailure | null> {
  return await applySchemaMigrations(files, liveAppDataStub(env, appId));
}

/** Bootstrap `${appId}:pr:N` from preview source — empty + migrations, no live clone. */
export async function applyPreviewSchemaMigrations(
  env: Env,
  appId: string,
  prNumber: number,
  files: Record<string, string>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await applySchemaMigrations(
    files,
    appDataStub(env, prDataId(appId, prNumber))
  );
  if (result) {
    return { ok: false, error: result.message };
  }
  return { ok: true };
}

async function gateSchema(
  env: Env,
  appId: string,
  files: Record<string, string>,
  opts?: { applyMigrations?: boolean }
): Promise<SchemaGateFailure | null> {
  const validated = await validateSchema(env, files);
  if (validated) {
    return validated;
  }
  if (opts?.applyMigrations === false) {
    return null;
  }
  return applyLiveSchemaMigrations(env, appId, files);
}

export type CdResult =
  | { ok: true; sha: string; liveSha: string | null; stages: CdStages }
  | { ok: false; error: string; detail?: unknown; stages?: CdStages };

async function setLiveSha(env: Env, appId: string, sha: string): Promise<void> {
  const db = createDb(env);
  await db
    .update(appTable)
    .set({ liveSha: sha, updatedAt: new Date() })
    .where(eq(appTable.id, appId));
}

export async function getLiveSha(
  env: Env,
  appId: string
): Promise<string | null> {
  const db = createDb(env);
  const row = await db.query.app.findFirst({
    where: eq(appTable.id, appId),
    columns: { liveSha: true },
  });
  return row?.liveSha ?? null;
}

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

async function publishLiveChanged(
  env: Env,
  appId: string,
  liveSha: string
): Promise<void> {
  const organizationId = await getAppOrganizationId(createDb(env), appId);
  if (!organizationId) {
    return;
  }
  publishOrgEvent(
    { env, organizationId },
    {
      topic: "app_live_changed",
      payload: { appId, liveSha },
    }
  );
}

/**
 * Point live at an existing build: AppDataDO(`${appId}:live`) migrations +
 * D1 live_sha + event. Skips lint/compile/check — callers must only use this
 * when BuildStore already has `sha` (e.g. green PR checks).
 */
async function promoteExistingBuild(
  env: Env,
  appId: string,
  sha: string,
  sourceFiles: Record<string, string>,
  opts?: { signal?: AbortSignal; startedAt?: number }
): Promise<CdResult> {
  const startedAt = opts?.startedAt ?? Date.now();
  const timings: CdStageTimings = {};
  const finish = (extra?: CdStageTimings): CdStages =>
    finishCdStages(startedAt, { ...timings, ...extra });
  const log = (stages: CdStages) => {
    console.log(cdStagesLogLine(appId, sha, stages));
  };

  if (aborted(opts?.signal)) {
    const stages = finish();
    log(stages);
    return { ok: false, error: "cd_aborted", stages };
  }
  const schemaStarted = Date.now();
  const schemaFailure = await applyLiveSchemaMigrations(
    env,
    appId,
    sourceFiles
  );
  timings.schemaMs = Date.now() - schemaStarted;
  if (schemaFailure) {
    const stages = finish();
    log(stages);
    return {
      ok: false,
      error: schemaFailure.error,
      detail: schemaFailure,
      stages,
    };
  }
  if (aborted(opts?.signal)) {
    const stages = finish();
    log(stages);
    return { ok: false, error: "cd_aborted", stages };
  }
  const writeStarted = Date.now();
  await setLiveSha(env, appId, sha);
  await publishLiveChanged(env, appId, sha);
  const stages = finish({ writeMs: Date.now() - writeStarted });
  log(stages);
  return { ok: true, sha, liveSha: sha, stages };
}

async function cdBuildArtifacts(
  env: Env,
  appId: string,
  sourceFiles: Record<string, string>,
  opts?: {
    forceColdCheck?: boolean;
    signal?: AbortSignal;
    applyMigrations?: boolean;
  }
): Promise<
  | {
      ok: true;
      compiled: Awaited<ReturnType<typeof build>>;
      tree: OverlaidTree;
      timings: CdStageTimings;
    }
  | { ok: false; error: string; detail?: unknown; timings: CdStageTimings }
> {
  const signal = opts?.signal;
  const timings: CdStageTimings = {};
  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted", timings };
  }

  const tree = overlayFormatFiles(sourceFiles);
  const files = tree.files;
  const lint = await callLint(env, appId, files);
  timings.lintMs = lint.wallMs;
  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted", timings };
  }
  if (lint.http >= 500 || lint.body?.ok === false || lint.body == null) {
    return {
      ok: false,
      error: "lint_failed",
      detail: { lintHttp: lint.http, lint: lint.body },
      timings,
    };
  }
  if (!lintPasses(lint.body)) {
    return {
      ok: false,
      error: "lint_failed",
      detail: { lint: lint.body },
      timings,
    };
  }

  let compiled: Awaited<ReturnType<typeof build>>;
  const buildStarted = Date.now();
  try {
    compiled = await build(tree);
  } catch (e) {
    timings.buildMs = Date.now() - buildStarted;
    return {
      ok: false,
      error: "compile_failed",
      detail: {
        message: e instanceof Error ? e.message : String(e),
      },
      timings,
    };
  }
  timings.buildMs = Date.now() - buildStarted;

  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted", timings };
  }

  const check = await callCheck(
    env,
    appId,
    files,
    opts?.forceColdCheck ?? false
  );
  timings.checkMs = check.wallMs;
  timings.checkAttempts = check.attempts;
  if (!(check.http < 500 && checkPasses(check.body))) {
    return {
      ok: false,
      error: "check_failed",
      detail: {
        checkHttp: check.http,
        check: check.body,
        checkAttempts: check.attempts,
      },
      timings,
    };
  }

  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted", timings };
  }

  const schemaStarted = Date.now();
  const schemaFailure = await gateSchema(env, appId, files, {
    applyMigrations: opts?.applyMigrations,
  });
  timings.schemaMs = Date.now() - schemaStarted;
  if (schemaFailure) {
    return {
      ok: false,
      error: schemaFailure.error,
      detail: schemaFailure,
      timings,
    };
  }

  return { ok: true, compiled, tree, timings };
}

/**
 * Run CD for a commit sha against the given source tree. On success writes an
 * immutable build to CODE_R2. When `advanceLive` is true (default), also
 * updates D1 `live_sha` and publishes `app_live_changed`.
 *
 * If advancing live and a build for `sha` already exists (and
 * `forceColdCheck` is not set), skips lint/compile/check and only promotes —
 * merge after green PR checks must not burn a second full CD.
 */
export async function runCdForSha(
  env: Env,
  appId: string,
  sha: string,
  sourceFiles: Record<string, string>,
  opts?: {
    forceColdCheck?: boolean;
    signal?: AbortSignal;
    advanceLive?: boolean;
  }
): Promise<CdResult> {
  const signal = opts?.signal;
  const advanceLive = opts?.advanceLive !== false;
  const startedAt = Date.now();
  const finish = (timings: CdStageTimings): CdStages =>
    finishCdStages(startedAt, timings);
  const log = (stages: CdStages) => {
    console.log(cdStagesLogLine(appId, sha, stages));
  };
  let timings: CdStageTimings = {};

  try {
    if (advanceLive && !opts?.forceColdCheck) {
      const existing = await createR2BuildStore(env).getBuild(appId, sha);
      if (existing) {
        return await promoteExistingBuild(env, appId, sha, sourceFiles, {
          signal,
          startedAt,
        });
      }
    }

    const built = await cdBuildArtifacts(env, appId, sourceFiles, {
      ...opts,
      applyMigrations: advanceLive,
    });
    timings = built.timings;
    if (!built.ok) {
      const stages = finish(timings);
      log(stages);
      return {
        ok: false,
        error: built.error,
        detail: built.detail,
        stages,
      };
    }

    const writeStarted = Date.now();
    const builds = createR2BuildStore(env);
    await builds.putBuild(
      appId,
      appBuildFromCompile(sha, built.tree, built.compiled)
    );

    if (!advanceLive) {
      const stages = finish({
        ...timings,
        writeMs: Date.now() - writeStarted,
      });
      log(stages);
      return { ok: true, sha, liveSha: null, stages };
    }

    await setLiveSha(env, appId, sha);
    await publishLiveChanged(env, appId, sha);
    const stages = finish({
      ...timings,
      writeMs: Date.now() - writeStarted,
    });
    log(stages);
    return { ok: true, sha, liveSha: sha, stages };
  } catch (e) {
    const stages = finish(timings);
    log(stages);
    if (aborted(signal)) {
      return { ok: false, error: "cd_aborted", stages };
    }
    return {
      ok: false,
      error: "cd_crashed",
      detail: { message: e instanceof Error ? e.message : String(e) },
      stages,
    };
  }
}

export type EnsureLiveResult =
  | { status: "in_sync"; tip: string | null }
  | { status: "updated"; tip: string; liveSha: string }
  | { status: "cd_failed"; tip: string; error: string; detail?: unknown };

/**
 * When main tip differs from D1 `live_sha`, promote tip to live. Reuses an
 * existing BuildStore entry when present (merge after checks); otherwise runs
 * full CD. Tree always comes from the code host tip — not a dirty workspace.
 */
export async function ensureLiveMatchesMain(
  env: Env,
  appId: string,
  opts?: { forceColdCheck?: boolean; signal?: AbortSignal }
): Promise<EnsureLiveResult> {
  const host = createR2CodeHost(env);
  const tip = await host.tipSha(appId, "main");
  if (!tip) {
    return { status: "in_sync", tip: null };
  }
  const live = await getLiveSha(env, appId);
  if (tip === live) {
    return { status: "in_sync", tip };
  }
  const sourceFiles = await host.readTreeAt(appId, tip);
  if (!sourceFiles) {
    return {
      status: "cd_failed",
      tip,
      error: "tree_missing",
      detail: { message: `no source tree at tip ${tip}` },
    };
  }
  const cd = await runCdForSha(env, appId, tip, sourceFiles, opts);
  if (!cd.ok) {
    return {
      status: "cd_failed",
      tip,
      error: cd.error,
      detail: cd.detail,
    };
  }
  return { status: "updated", tip, liveSha: cd.liveSha ?? tip };
}
