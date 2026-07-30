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
import { eq } from "drizzle-orm";
import { prDataId } from "./app-data-ids.js";
import { collectMigrations } from "./app-migrations.js";
import { type AppDataStub, appDataStub, liveAppDataStub } from "./app-stub.js";
import { compileAll } from "./compile-all.js";
import { createDb } from "./db/index.js";
import { app as appTable } from "./db/schema.js";
import { publishOrgEvent } from "./org-events.js";
import { createR2BuildStore } from "./r2-build-store.js";
import { createR2CodeHost } from "./r2-code-host.js";
import { getAppOrganizationId } from "./registry.js";
import { diffSchema } from "./schema-ddl.js";
import { probeSchema } from "./schema-probe.js";
import { latestSnapshot } from "./schema-snapshots.js";

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
          body: JSON.stringify({ appId, files, forceCold }),
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
  | { ok: true; sha: string; liveSha: string | null }
  | { ok: false; error: string; detail?: unknown };

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
  opts?: { signal?: AbortSignal }
): Promise<CdResult> {
  if (aborted(opts?.signal)) {
    return { ok: false, error: "cd_aborted" };
  }
  const schemaFailure = await applyLiveSchemaMigrations(
    env,
    appId,
    sourceFiles
  );
  if (schemaFailure) {
    return {
      ok: false,
      error: schemaFailure.error,
      detail: schemaFailure,
    };
  }
  if (aborted(opts?.signal)) {
    return { ok: false, error: "cd_aborted" };
  }
  await setLiveSha(env, appId, sha);
  await publishLiveChanged(env, appId, sha);
  return { ok: true, sha, liveSha: sha };
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
  | { ok: true; compiled: Awaited<ReturnType<typeof compileAll>> }
  | { ok: false; error: string; detail?: unknown }
> {
  const signal = opts?.signal;
  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted" };
  }

  const lint = await callLint(env, appId, sourceFiles);
  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted" };
  }
  if (lint.http >= 500 || lint.body?.ok === false || lint.body == null) {
    return {
      ok: false,
      error: "lint_failed",
      detail: { lintHttp: lint.http, lint: lint.body },
    };
  }
  if (!lintPasses(lint.body)) {
    return {
      ok: false,
      error: "lint_failed",
      detail: { lint: lint.body },
    };
  }

  let compiled: Awaited<ReturnType<typeof compileAll>>;
  try {
    compiled = await compileAll(sourceFiles);
  } catch (e) {
    return {
      ok: false,
      error: "compile_failed",
      detail: {
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted" };
  }

  const check = await callCheck(
    env,
    appId,
    sourceFiles,
    opts?.forceColdCheck ?? false
  );
  if (!(check.http < 500 && checkPasses(check.body))) {
    return {
      ok: false,
      error: "check_failed",
      detail: {
        checkHttp: check.http,
        check: check.body,
        checkAttempts: check.attempts,
      },
    };
  }

  if (aborted(signal)) {
    return { ok: false, error: "cd_aborted" };
  }

  const schemaFailure = await gateSchema(env, appId, sourceFiles, {
    applyMigrations: opts?.applyMigrations,
  });
  if (schemaFailure) {
    return {
      ok: false,
      error: schemaFailure.error,
      detail: schemaFailure,
    };
  }

  return { ok: true, compiled };
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

  try {
    if (advanceLive && !opts?.forceColdCheck) {
      const existing = await createR2BuildStore(env).getBuild(appId, sha);
      if (existing) {
        return await promoteExistingBuild(env, appId, sha, sourceFiles, {
          signal,
        });
      }
    }

    const built = await cdBuildArtifacts(env, appId, sourceFiles, {
      ...opts,
      applyMigrations: advanceLive,
    });
    if (!built.ok) {
      return { ok: false, error: built.error, detail: built.detail };
    }

    const builds = createR2BuildStore(env);
    await builds.putBuild(appId, {
      sha,
      serverBundle: built.compiled.compiled.serverBundle,
      assets: built.compiled.assets,
      kernelVersion: built.compiled.compiled.kernelVersion,
      serverSurfaceHash: built.compiled.compiled.serverSurfaceHash,
    });

    if (!advanceLive) {
      return { ok: true, sha, liveSha: null };
    }

    await setLiveSha(env, appId, sha);
    await publishLiveChanged(env, appId, sha);
    return { ok: true, sha, liveSha: sha };
  } catch (e) {
    if (aborted(signal)) {
      return { ok: false, error: "cd_aborted" };
    }
    return {
      ok: false,
      error: "cd_crashed",
      detail: { message: e instanceof Error ? e.message : String(e) },
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
