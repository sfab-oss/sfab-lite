/**
 * Commit / check orchestration for the factory host worker.
 *
 * Owns the AppDO stub surface, lint+compile+check gates, and the
 * accepted-attempt / conflict contract used by both ordinary commits and
 * app creation.
 */
import type { CheckResult, LintResult } from "@sfab-lite/core";
import type {
  AttemptKind,
  AttemptRecord,
  PutVersionInput,
  VersionRecord,
} from "./app-do.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";
import type { AttemptResolver } from "./registry.js";

/** Explicit stub surface — DO Rpc generics erase method returns under tsc alone. */
export interface AppStub {
  touch: () => Promise<{
    ok: true;
    appIdHint: string;
    appSchemaVersion: number;
    userCount: number | null;
    liveVersionId: string | null;
  }>;
  bootstrap: (migrations: { id: string; sql: string }[]) => Promise<{
    ok: true;
    bootstrapped: boolean;
    appSchemaVersion: number;
    bootstrapMs: number;
  }>;
  putVersion: (input: {
    parentId: string | null;
    sourceFiles: Record<string, string>;
    serverBundle: string;
    assets: Record<string, string>;
    kernelVersion: string;
  }) => Promise<{
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  }>;
  revertTo: (versionId: string) => Promise<
    | {
        ok: true;
        id: string;
        attemptId: string;
        liveVersionId: string;
        parentId: string;
        restoredFrom: string;
      }
    | { ok: false; error: string }
  >;
  listVersions: () => Promise<{
    ok: true;
    liveVersionId: string | null;
    versions: {
      id: string;
      parentId: string | null;
      createdAt: number;
      kernelVersion: string;
      serverBundleBytes: number;
      assetKeys: string[];
    }[];
  }>;
  getVersion: (
    versionId: string
  ) => Promise<{ ok: true; version: VersionRecord | null }>;
  getLatest: () => Promise<{ ok: true; version: VersionRecord | null }>;
  getLive: () => Promise<{
    ok: true;
    liveVersionId: string | null;
    version: VersionRecord | null;
  }>;
  startAttempt: (
    kind: AttemptKind,
    parentId: string | null
  ) => Promise<
    | { ok: true; attemptId: string }
    | { ok: false; error: "attempt_in_flight"; attemptId: string }
  >;
  failAttempt: (
    attemptId: string,
    status: "fail" | "error",
    payload?: unknown
  ) => Promise<{ ok: true; attemptId: string; status: string }>;
  completeAttempt: (
    attemptId: string,
    input: PutVersionInput,
    payload?: unknown
  ) => Promise<{
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  }>;
  getAttempt: (
    attemptId: string
  ) => Promise<{ ok: true; attempt: AttemptRecord | null }>;
  listAttempts: (
    limit?: number
  ) => Promise<{ ok: true; attempts: AttemptRecord[] }>;
}

export function appStub(env: Env, appId: string): AppStub {
  return env.APP_DO.get(env.APP_DO.idFromName(appId)) as unknown as AppStub;
}

/** Fail closed for /admin when ADMIN_TOKEN is configured. */
function serviceHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (env.ADMIN_TOKEN) {
    h["X-Admin-Token"] = env.ADMIN_TOKEN;
  }
  return h;
}

/** Inline of former checkPassesForPublish — no IGNORED_CHECK_CODES. */
export function checkPasses(body: CheckResult | null): boolean {
  if (!body?.ok) {
    return false;
  }
  return body.diagnosticCount === 0;
}

async function callLint(
  env: Env,
  appId: string,
  files: Record<string, string>
): Promise<{ http: number; wallMs: number; body: LintResult | null }> {
  const t0 = Date.now();
  const res = await env.LINT.fetch(
    new Request("https://lint-worker/lint", {
      method: "POST",
      headers: serviceHeaders(env),
      body: JSON.stringify({
        appId,
        files,
        mode: "both",
      }),
    })
  );
  const body = (await res.json().catch(() => null)) as LintResult | null;
  return { http: res.status, wallMs: Date.now() - t0, body };
}

export async function callCheck(
  env: Env,
  appId: string,
  files: Record<string, string>,
  forceCold = false
): Promise<{ http: number; wallMs: number; body: CheckResult | null }> {
  const t0 = Date.now();
  const res = await env.CHECK.fetch(
    new Request("https://check-worker/check", {
      method: "POST",
      headers: serviceHeaders(env),
      body: JSON.stringify({
        appId,
        files,
        forceCold,
      }),
    })
  );
  const body = (await res.json().catch(() => null)) as CheckResult | null;
  return { http: res.status, wallMs: Date.now() - t0, body };
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

/**
 * The work half of a commit: lint → compile → check → version.
 *
 * Runs under `ctx.waitUntil`, after the response has already gone out, so it
 * has no caller to throw to. Every exit path must therefore write a terminal
 * attempt status — that is the entire reliability contract, because a poller
 * can only distinguish "still working" from "finished badly" if this function
 * never simply stops.
 *
 * `fail` means the submitted code did not pass the gate; `error` means we
 * broke. The distinction is what tells an agent whether to fix its diff or
 * retry the same one.
 */
export async function runCommitAttempt(
  env: Env,
  appId: string,
  attemptId: string,
  files: Record<string, string>,
  parentId: string | null,
  opts?: { forceColdCheck?: boolean }
): Promise<"pass" | "fail" | "error"> {
  const stub = appStub(env, appId);
  const tAll0 = Date.now();

  try {
    const lint = await callLint(env, appId, files);
    if (lint.http >= 500 || lint.body?.ok === false) {
      await stub.failAttempt(attemptId, "error", {
        error: "lint_failed",
        lintHttp: lint.http,
        lintWallMs: lint.wallMs,
        lint: lint.body,
      });
      return "error";
    }

    let compiled: Awaited<ReturnType<typeof compileAll>>;
    try {
      compiled = await compileAll(files);
    } catch (e) {
      await stub.failAttempt(attemptId, "error", {
        error: "compile_failed",
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return "error";
    }

    const check = await callCheck(
      env,
      appId,
      files,
      opts?.forceColdCheck ?? false
    );
    if (!(check.http < 500 && checkPasses(check.body))) {
      await stub.failAttempt(attemptId, "fail", {
        error: "check_failed",
        checkHttp: check.http,
        checkWallMs: check.wallMs,
        check: check.body,
        publishGate: false,
        totalMs: Date.now() - tAll0,
      });
      return "fail";
    }

    const lintDiagCount = (lint.body?.files ?? []).reduce(
      (n, f) => n + (f.diagnosticCount ?? 0),
      0
    );

    await stub.completeAttempt(
      attemptId,
      {
        parentId,
        sourceFiles: files,
        serverBundle: compiled.compiled.serverBundle,
        assets: compiled.assets,
        kernelVersion: compiled.compiled.kernelVersion,
      },
      {
        live: true,
        lintHttp: lint.http,
        lintWallMs: lint.wallMs,
        lintDiagnosticCount: lintDiagCount,
        lintFileCount: lint.body?.fileCount ?? null,
        checkHttp: check.http,
        checkWallMs: check.wallMs,
        checkMs: check.body?.checkMs ?? null,
        checkPass: check.body?.pass ?? null,
        lsReused: check.body?.lsReused ?? null,
        compileMs: compiled.compiled.compileMs,
        clientCompileMs: compiled.client.compileMs,
        cssCompileMs: compiled.css.compileMs + compiled.css.buildMs,
        totalCommitMs: Date.now() - tAll0,
        serverBundleBytes: compiled.compiled.serverBundle.length,
        clientBytes: compiled.client.js.length,
        cssBytes: compiled.css.css.length,
        cssCandidates: compiled.css.candidateCount,
        kernelVersion: compiled.compiled.kernelVersion,
        clientBailouts: compiled.client.bailouts,
        warnings: compiled.compiled.warnings,
      }
    );
    return "pass";
  } catch (e) {
    // Last resort. If even this write fails there is nothing left to record
    // with — the stale sweep in the AppDO is the backstop for that case.
    await stub
      .failAttempt(attemptId, "error", {
        error: "attempt_crashed",
        message: e instanceof Error ? e.message : String(e),
        totalMs: Date.now() - tAll0,
      })
      .catch(() => undefined);
    return "error";
  }
}

/**
 * Open an attempt and hand the work to `waitUntil`.
 *
 * Returns in milliseconds; the commit itself takes 10–24s (measured in
 * production, S2.5). The guarantee is unchanged — check is still the gate and
 * no version exists without a pass. Only the waiting moved off the request.
 */
/**
 * The accepted-attempt contract, in one place.
 *
 * Two callers enqueue work — an ordinary commit and app creation — and their
 * orchestration legitimately differs, since creation also has a D1 row to
 * settle. Their contract must not differ: a client polls a create exactly the
 * way it polls a commit. So the 202 shape and the poll URL live here rather
 * than being written out at each call site, where they could quietly drift.
 */
export function attemptAccepted(
  appId: string,
  kind: AttemptKind,
  attemptId: string,
  parentId: string | null,
  extra?: Record<string, unknown>
): Response {
  return Response.json(
    {
      ok: true,
      appId,
      kind,
      attemptId,
      parentId,
      status: "pending",
      poll: `/admin/apps/${encodeURIComponent(appId)}/attempts/${attemptId}`,
      ...extra,
    },
    { status: 202 }
  );
}

/** The refusal half of the same contract — see `AppDO.startAttempt`. */
export function attemptConflict(appId: string, attemptId: string): Response {
  return Response.json(
    { ok: false, error: "attempt_in_flight", appId, attemptId },
    { status: 409 }
  );
}

export async function enqueueCommit(
  env: Env,
  ctx: ExecutionContext,
  appId: string,
  kind: AttemptKind,
  files: Record<string, string>,
  parentId: string | null,
  opts?: { forceColdCheck?: boolean }
): Promise<Response> {
  const start = await appStub(env, appId).startAttempt(kind, parentId);
  if (!start.ok) {
    return attemptConflict(appId, start.attemptId);
  }

  ctx.waitUntil(
    runCommitAttempt(env, appId, start.attemptId, files, parentId, opts)
  );

  return attemptAccepted(appId, kind, start.attemptId, parentId);
}

/**
 * How the registry asks the AppDO what really happened to a seed attempt.
 * Passed in rather than imported by `registry.ts`, which must not reach into
 * the host worker's plumbing.
 */
export function attemptResolver(env: Env): AttemptResolver {
  return async (appId, attemptId) => {
    const { attempt } = await appStub(env, appId).getAttempt(attemptId);
    return attempt ? attempt.status : "missing";
  };
}
