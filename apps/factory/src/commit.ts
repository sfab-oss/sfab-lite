/**
 * Commit / check orchestration for the factory host worker.
 *
 * Owns the AppDO stub surface, lint+compile+check gates, and the
 * accepted-attempt / conflict contract used by both ordinary commits and
 * app creation.
 */
import {
  type CheckResult,
  type LintMode,
  type LintResult,
  lintPasses,
} from "@sfab-lite/core";
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
  destroy: () => Promise<
    | { ok: true; bytesFreed: number }
    | { ok: false; error: "attempt_in_flight"; attemptId: string }
  >;
  putVersion: (input: {
    parentId: string | null;
    sourceFiles: Record<string, string>;
    serverBundle: string;
    assets: Record<string, string>;
    kernelVersion: string;
    serverSurfaceHash: string | null;
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
      body: JSON.stringify({
        appId,
        files,
        mode,
      }),
    })
  );
  const body = (await res.json().catch(() => null)) as LintResult | null;
  return { http: res.status, wallMs: Date.now() - t0, body };
}

/**
 * Total attempts against the check worker, including the first.
 *
 * A full TypeScript program over the frozen types VFS sits right at the edge of
 * a Worker isolate's 128 MB, so the check worker dies with `exceededMemory` on
 * roughly half of all requests — measured, see
 * `apps/check/scripts/measure-split.mjs`. That is a property of the template's
 * dependency graph (drizzle-orm, better-auth and zod together account for ~550
 * of the 877 `.d.ts` files the program loads), not of any app's code, so no
 * app can avoid it and no retry count fixes it in principle.
 *
 * **The retry budget is bounded by wall clock, not by how many retries would
 * help.** `runCommitAttempt` runs under `ctx.waitUntil`, whose work is killed
 * after roughly 30 s — and a killed attempt writes no terminal status, so the
 * app sits in `creating` until the AppDO's stale sweep reclaims it 5 minutes
 * later as `attempt_abandoned`. Four attempts (~45 s) was measured doing
 * exactly that: three of eight creates hung for 5 minutes instead of failing
 * in 15 s, which is a strictly worse experience than the crash it replaced.
 *
 * Each check costs ~10 s in production, so two attempts is what fits beside
 * lint and compile. That buys ~50% -> ~75% and keeps a failure fast and
 * terminal. Raising this number without moving the work off `waitUntil` will
 * reintroduce the hang.
 *
 * This is a **mitigation, not a fix**. See
 * `docs/notes/2026-07-25-check-worker-memory.md`.
 */
const CHECK_ATTEMPTS = 2;
/**
 * Long enough to land on a replacement isolate rather than racing the dead
 * one, short enough to stay inside the waitUntil budget above.
 */
const CHECK_RETRY_DELAY_MS = 300;

/**
 * An `exceededMemory` kill surfaces as the service binding *throwing*, not as
 * an HTTP status — the isolate dies mid-response. An error status, by contrast,
 * is the check worker answering, so it is a real result and never retried.
 */
export async function callCheck(
  env: Env,
  appId: string,
  files: Record<string, string>,
  forceCold = false
): Promise<{
  http: number;
  wallMs: number;
  body: CheckResult | null;
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
      const body = (await res.json().catch(() => null)) as CheckResult | null;
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

  // Rethrow so the caller still records `attempt_crashed` with the real
  // message. Swallowing this would turn a systemic limit into silent slowness.
  throw lastError;
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

class DeployAbortedError extends Error {
  constructor() {
    super("deploy_aborted");
    this.name = "DeployAbortedError";
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DeployAbortedError();
  }
}

async function gateLint(
  stub: AppStub,
  attemptId: string,
  lint: Awaited<ReturnType<typeof callLint>>,
  tAll0: number
): Promise<"fail" | "error" | null> {
  if (lint.http >= 500 || lint.body?.ok === false) {
    await stub.failAttempt(attemptId, "error", {
      error: "lint_failed",
      lintHttp: lint.http,
      lintWallMs: lint.wallMs,
      lint: lint.body,
    });
    return "error";
  }
  if (lint.body == null) {
    await stub.failAttempt(attemptId, "error", {
      error: "lint_failed",
      lintHttp: lint.http,
      lintWallMs: lint.wallMs,
      lint: null,
    });
    return "error";
  }
  if (!lintPasses(lint.body)) {
    await stub.failAttempt(attemptId, "fail", {
      error: "lint_failed",
      lintHttp: lint.http,
      lintWallMs: lint.wallMs,
      lint: lint.body,
      publishGate: false,
      totalMs: Date.now() - tAll0,
    });
    return "fail";
  }
  return null;
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
 *
 * Optional `signal`: agent bash deploy awaits this function on the turn so
 * exit codes stay real (factory `cpu_ms` is 300_000; commits measure 10–24s).
 * When the bash AbortController fires, we fail the attempt instead of leaving
 * it pending until STALE_ATTEMPT_MS.
 */
export async function runCommitAttempt(
  env: Env,
  appId: string,
  attemptId: string,
  files: Record<string, string>,
  parentId: string | null,
  opts?: { forceColdCheck?: boolean; signal?: AbortSignal }
): Promise<"pass" | "fail" | "error" | "aborted"> {
  const stub = appStub(env, appId);
  const tAll0 = Date.now();
  const signal = opts?.signal;

  try {
    throwIfAborted(signal);
    const lint = await callLint(env, appId, files);
    throwIfAborted(signal);
    const lintGate = await gateLint(stub, attemptId, lint, tAll0);
    if (lintGate) {
      return lintGate;
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

    throwIfAborted(signal);
    const check = await callCheck(
      env,
      appId,
      files,
      opts?.forceColdCheck ?? false
    );
    throwIfAborted(signal);
    if (!(check.http < 500 && checkPasses(check.body))) {
      await stub.failAttempt(attemptId, "fail", {
        error: "check_failed",
        checkHttp: check.http,
        checkWallMs: check.wallMs,
        checkAttempts: check.attempts,
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
        serverSurfaceHash: compiled.compiled.serverSurfaceHash,
      },
      {
        live: true,
        lintHttp: lint.http,
        lintWallMs: lint.wallMs,
        lintDiagnosticCount: lintDiagCount,
        lintFileCount: lint.body?.fileCount ?? null,
        lint: lint.body,
        checkHttp: check.http,
        checkWallMs: check.wallMs,
        checkMs: check.body?.checkMs ?? null,
        checkPass: check.body?.pass ?? null,
        // >1 means the check worker died and was retried. Recorded so the OOM
        // rate stays visible instead of hiding inside a longer commit.
        checkAttempts: check.attempts,
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
        serverSurfaceHash: compiled.compiled.serverSurfaceHash,
        clientBailouts: compiled.client.bailouts,
        warnings: compiled.compiled.warnings,
      }
    );
    return "pass";
  } catch (e) {
    if (e instanceof DeployAbortedError || signal?.aborted) {
      await stub
        .failAttempt(attemptId, "error", {
          error: "deploy_aborted",
          totalMs: Date.now() - tAll0,
        })
        .catch(() => undefined);
      return "aborted";
    }
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
 * production). The guarantee is unchanged — check is still the gate and
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
