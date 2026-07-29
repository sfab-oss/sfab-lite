/**
 * Minimal CD: lint → compile → check → schema → write build → set live_sha.
 *
 * Triggered on app create (initial main) and when main advances (git push).
 */
import {
  type CheckResponse,
  type CheckResult,
  type LintMode,
  type LintResult,
  lintPasses,
} from "@sfab-lite/core";
import { eq } from "drizzle-orm";
import { collectMigrations } from "./app-migrations.js";
import { appStub } from "./app-stub.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";
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

async function gateSchema(
  env: Env,
  appId: string,
  files: Record<string, string>
): Promise<SchemaGateFailure | null> {
  const stub = appStub(env, appId);
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

  const migrations = collectMigrations(files);
  if (migrations.length > 0) {
    try {
      await stub.bootstrap(migrations);
    } catch (cause) {
      return {
        error: "schema_history_changed",
        message: cause instanceof Error ? cause.message : String(cause),
        detail: null,
      };
    }
  }

  return null;
}

async function compileAll(files: Record<string, string>) {
  const compiled = await compileServer(files);
  const client = await compileClient(files);
  const css = await compileCss(files);
  const assets: Record<string, string> = {
    "index.html": buildIndexHtml({
      kernelVersion: compiled.kernelVersion,
    }),
    "assets/app.js": client.js,
    "assets/app.css": css.css,
  };
  return { compiled, client, css, assets };
}

export type CdResult =
  | { ok: true; sha: string; liveSha: string }
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

/**
 * Run CD for a commit sha against the given source tree. On success writes an
 * immutable build to CODE_R2 and updates D1 `live_sha`.
 */
export async function runCdForSha(
  env: Env,
  appId: string,
  sha: string,
  sourceFiles: Record<string, string>,
  opts?: { forceColdCheck?: boolean; signal?: AbortSignal }
): Promise<CdResult> {
  const signal = opts?.signal;

  try {
    if (signal?.aborted) {
      return { ok: false, error: "cd_aborted" };
    }

    const lint = await callLint(env, appId, sourceFiles);
    if (signal?.aborted) {
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

    if (signal?.aborted) {
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

    if (signal?.aborted) {
      return { ok: false, error: "cd_aborted" };
    }

    const schemaFailure = await gateSchema(env, appId, sourceFiles);
    if (schemaFailure) {
      return {
        ok: false,
        error: schemaFailure.error,
        detail: schemaFailure,
      };
    }

    const builds = createR2BuildStore(env);
    await builds.putBuild(appId, {
      sha,
      serverBundle: compiled.compiled.serverBundle,
      assets: compiled.assets,
      kernelVersion: compiled.compiled.kernelVersion,
      serverSurfaceHash: compiled.compiled.serverSurfaceHash,
    });
    await setLiveSha(env, appId, sha);

    const organizationId = await getAppOrganizationId(createDb(env), appId);
    if (organizationId) {
      publishOrgEvent(
        { env, organizationId },
        {
          topic: "app_live_changed",
          payload: { appId, liveSha: sha },
        }
      );
    }

    return { ok: true, sha, liveSha: sha };
  } catch (e) {
    if (signal?.aborted) {
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
 * Run CD when main tip exists and differs from D1 `live_sha` (retry path after
 * a failed CD that already advanced the remote tip).
 */
export async function ensureLiveMatchesMain(
  env: Env,
  appId: string,
  sourceFiles: Record<string, string>,
  opts?: { forceColdCheck?: boolean; signal?: AbortSignal }
): Promise<EnsureLiveResult> {
  const tip = await createR2CodeHost(env).tipSha(appId, "main");
  if (!tip) {
    return { status: "in_sync", tip: null };
  }
  const live = await getLiveSha(env, appId);
  if (tip === live) {
    return { status: "in_sync", tip };
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
  return { status: "updated", tip, liveSha: cd.liveSha };
}
