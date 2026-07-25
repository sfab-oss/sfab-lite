/**
 * @sfab-lite/factory — host worker (S2.6).
 *
 * Commit is **asynchronous in transport, synchronous in semantics**: check is
 * still the gate, no version exists without a pass, and a version is live the
 * moment it exists. Only the waiting moved off the HTTP request, because a
 * commit costs 10–24s in production (measured, S2.5).
 *
 * `POST .../commit` and `POST /admin/apps` return `202` with an `attemptId`;
 * poll `GET .../attempts/:attemptId`. Create also writes a D1 registry row
 * (`creating` → `ready`|`failed`) so apps are enumerable. Revert stays
 * synchronous — it restores an already-checked version, so there is nothing
 * to wait for.
 *
 * Admin (S3c): every `/admin/*` request needs a credential — a matching
 * `X-Admin-Token` (root, must name its `organizationId`) or a signed-in
 * session (scoped to its own organization). No credential is 401 whatever the
 * config says; a missing `ADMIN_TOKEN` no longer opens the surface. See
 * `tenancy.ts`.
 */
import type { CheckResult, LintResult } from "@sfab-lite/core";
import { mergeSources } from "@sfab-lite/core";
import type {
  AttemptKind,
  AttemptRecord,
  PutVersionInput,
  VersionRecord,
} from "./app-do.js";
import { createAuth, passwordAuthEnabled } from "./auth.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";
import { createDb } from "./db/index.js";
import TEMPLATE_SEED from "./generated/seed.json" with { type: "json" };
import type { AttemptResolver } from "./registry.js";
import {
  getApp,
  insertCreatingApp,
  listAppsForOrganization,
  markCreateFailed,
  organizationExists,
  setCreateAttemptId,
  settleCreateApp,
} from "./registry.js";
import type { ScopedSqlProps } from "./scoped-sql.js";
import { serveSubApp } from "./serve.js";
import { serveKernel } from "./serve-kernel.js";
import type { Actor } from "./tenancy.js";
import {
  requireAppAccess,
  resolveActor,
  resolveOrganization,
} from "./tenancy.js";

export { AppDO } from "./app-do.js";
export { ScopedSql } from "./scoped-sql.js";

/** Explicit stub surface — DO Rpc generics erase method returns under tsc alone. */
interface AppStub {
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

function appStub(env: Env, appId: string): AppStub {
  return env.APP_DO.get(env.APP_DO.idFromName(appId)) as unknown as AppStub;
}

/** ctx.exports typing for WorkerEntrypoint classes isn't inferred by tsc alone. */
interface HostExports {
  ScopedSql: (opts: { props: ScopedSqlProps }) => {
    prepare: (query: string) => {
      bind: (...values: unknown[]) => {
        all: () => Promise<{
          success: true;
          results: Record<string, unknown>[];
          meta: unknown;
        }>;
      };
      all: () => Promise<{
        success: true;
        results: Record<string, unknown>[];
        meta: unknown;
      }>;
    };
    pingScope: () => Promise<{
      appId: string;
      ok: true;
      backend: "do-sqlite";
    }>;
  };
}

function scopedDb(ctx: ExecutionContext, appId: string) {
  const ex = ctx.exports as unknown as HostExports;
  return ex.ScopedSql({ props: { appId } satisfies ScopedSqlProps });
}

function jsonError(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
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
function checkPasses(body: CheckResult | null): boolean {
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

async function callCheck(
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
async function runCommitAttempt(
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
function attemptAccepted(
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
function attemptConflict(appId: string, attemptId: string): Response {
  return Response.json(
    { ok: false, error: "attempt_in_flight", appId, attemptId },
    { status: 409 }
  );
}

async function enqueueCommit(
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

// --- Module-scope route patterns (compiled once) ---

const RE_KERNEL = /^\/kernel\/(.+)$/;
const RE_SUBAPP = /^\/a\/([^/]+)(?:\/(.*))?$/;
const RE_ADMIN_TOUCH = /^\/admin\/apps\/([^/]+)\/touch$/;
const RE_ADMIN_SQL = /^\/admin\/apps\/([^/]+)\/sql$/;
const RE_ADMIN_VERSIONS = /^\/admin\/apps\/([^/]+)\/versions$/;
const RE_ADMIN_ATTEMPTS = /^\/admin\/apps\/([^/]+)\/attempts$/;
const RE_ADMIN_ATTEMPT = /^\/admin\/apps\/([^/]+)\/attempts\/([^/]+)$/;
const RE_ADMIN_CHECK = /^\/admin\/apps\/([^/]+)\/check$/;
const RE_ADMIN_COMMIT = /^\/admin\/apps\/([^/]+)\/commit$/;
const RE_ADMIN_REVERT = /^\/admin\/apps\/([^/]+)\/revert$/;

/** A request before any route has matched it. */
interface RequestCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
}

/** …and after. `match` exists only once a pattern produced it. */
interface RouteCtx extends RequestCtx {
  match: RegExpMatchArray;
}

/** A request that cleared the `/admin` credential gate. */
interface AdminCtx extends RouteCtx {
  actor: Actor;
}

/**
 * An admin request for one specific app, already checked to belong to the
 * actor. `appId` arrives decoded because the dispatcher had to decode it to
 * run that check — handlers no longer parse `match[1]` themselves.
 */
interface AppCtx extends AdminCtx {
  appId: string;
}

interface PublicRoute {
  method: string | readonly string[];
  pattern: RegExp;
  handler: (rc: RouteCtx) => Promise<Response> | Response;
}

/**
 * Admin routes declare their scope, and the scope *is* the authorization.
 *
 * `"app"` routes take an app id in `match[1]`; the dispatcher runs
 * `requireAppAccess` and hands the handler an `AppCtx`. A new app-scoped route
 * cannot silently skip the ownership check, because the only way to receive an
 * `appId` is to ask for the scope that checks it.
 */
type AdminRoute = {
  method: string | readonly string[];
  pattern: RegExp;
} & (
  | {
      scope: "factory";
      handler: (rc: AdminCtx) => Promise<Response> | Response;
    }
  | { scope: "app"; handler: (rc: AppCtx) => Promise<Response> | Response }
);

function methodMatches(
  allowed: string | readonly string[],
  method: string
): boolean {
  if (typeof allowed === "string") {
    return allowed === method;
  }
  return allowed.includes(method);
}

/**
 * Create an app: D1 row first (`creating`), then bootstrap + async seed.
 *
 * App ids are server-minted (`app_…`). The old caller-supplied id path also
 * returned `alreadySeeded: true` on collision — with owning organizations that
 * was a tenancy hole (silently attach to whoever already held the name). Gone.
 *
 * The owning organization comes from the actor (S3c): a session acts on its
 * own, a token must name one. `registry.ts` was written to take it as an
 * argument and needed no change.
 */
async function handleCreateApp(rc: AdminCtx): Promise<Response> {
  const body = (await rc.request.json().catch(() => null)) as {
    organizationId?: string;
    name?: string;
  } | null;
  const scope = resolveOrganization(rc.actor, body?.organizationId);
  if (scope instanceof Response) {
    return scope;
  }
  const { organizationId } = scope;
  const name = body?.name?.trim();
  if (!name) {
    return jsonError("name required");
  }

  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return jsonError("organization_not_found", 404);
  }

  // Row before DO work: the UI needs something to poll during the ~18–25s seed.
  const created = await insertCreatingApp(db, { organizationId, name });
  const appId = created.id;
  const stub = appStub(rc.env, appId);

  try {
    await stub.bootstrap(TEMPLATE_SEED.migrations);
  } catch (e) {
    await markCreateFailed(db, appId);
    return jsonError(e instanceof Error ? e.message : "bootstrap_failed", 500);
  }

  // Creation *is* a commit — same gate, same 202 — but the registry must
  // settle when the attempt does. That transition lives in the waitUntil
  // chain below (not inside `runCommitAttempt`) so ordinary commits stay
  // unaware of D1.
  const start = await stub.startAttempt("create", null);
  if (!start.ok) {
    await markCreateFailed(db, appId);
    return attemptConflict(appId, start.attemptId);
  }

  await setCreateAttemptId(db, appId, start.attemptId);

  rc.ctx.waitUntil(
    (async () => {
      const status = await runCommitAttempt(
        rc.env,
        appId,
        start.attemptId,
        TEMPLATE_SEED.sourceFiles,
        null,
        { forceColdCheck: true }
      );
      await settleCreateApp(createDb(rc.env), appId, status);
    })()
  );

  return attemptAccepted(appId, "create", start.attemptId, null, {
    organizationId,
    name,
    appStatus: "creating",
  });
}

/**
 * How the registry asks the AppDO what really happened to a seed attempt.
 * Passed in rather than imported by `registry.ts`, which must not reach into
 * the host worker's plumbing.
 */
function attemptResolver(env: Env): AttemptResolver {
  return async (appId, attemptId) => {
    const { attempt } = await appStub(env, appId).getAttempt(attemptId);
    return attempt ? attempt.status : "missing";
  };
}

async function handleListApps(rc: AdminCtx): Promise<Response> {
  const scope = resolveOrganization(
    rc.actor,
    rc.url.searchParams.get("organizationId") ?? undefined
  );
  if (scope instanceof Response) {
    return scope;
  }
  const { organizationId } = scope;
  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return jsonError("organization_not_found", 404);
  }
  const apps = await listAppsForOrganization(
    db,
    organizationId,
    attemptResolver(rc.env)
  );
  return Response.json({ ok: true, organizationId, apps });
}

/**
 * Read one app's registry record.
 *
 * Dispatch already proved the actor may touch this app, so the org-scoped
 * `getApp` below repeats one indexed read for a session caller. Kept anyway:
 * this route is also where the stale-`creating` sweep belongs (a status poll
 * is exactly when reconciling matters), and "every `/admin/apps/:id…` route is
 * access-checked, no exceptions" is worth more than saving a read.
 */
async function handleGetApp(rc: AppCtx): Promise<Response> {
  const scope = resolveOrganization(
    rc.actor,
    rc.url.searchParams.get("organizationId") ?? undefined
  );
  if (scope instanceof Response) {
    return scope;
  }
  const record = await getApp(
    createDb(rc.env),
    scope.organizationId,
    rc.appId,
    attemptResolver(rc.env)
  );
  if (!record) {
    // Deliberately the same answer for "no such app" and "not your app".
    return jsonError("app_not_found", 404);
  }
  return Response.json({ ok: true, app: record });
}

async function handleTouch(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const touch = await appStub(rc.env, appId).touch();
  return Response.json({ ok: true, appId, touch });
}

async function handleSql(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    query?: string;
    binds?: unknown[];
  } | null;
  if (!body?.query) {
    return jsonError("query required");
  }
  const db = scopedDb(rc.ctx, appId);
  const ping = await db.pingScope();
  const result = await db
    .prepare(body.query)
    .bind(...(body.binds ?? []))
    .all();
  return Response.json({ ok: true, appId, ping, result });
}

async function handleListVersions(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const listed = await appStub(rc.env, appId).listVersions();
  return Response.json({ appId, ...listed });
}

async function handleGetAttempt(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const attemptId = decodeURIComponent(rc.match[2] ?? "");
  const { attempt } = await appStub(rc.env, appId).getAttempt(attemptId);
  if (!attempt) {
    return jsonError("attempt_not_found", 404);
  }
  return Response.json({ ok: true, appId, attempt });
}

async function handleListAttempts(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const raw = Number(rc.url.searchParams.get("limit"));
  const { attempts } = await appStub(rc.env, appId).listAttempts(
    Number.isFinite(raw) && raw > 0 ? raw : undefined
  );
  return Response.json({ ok: true, appId, attempts });
}

async function handleCheck(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    files?: Record<string, string | null>;
    forceCold?: boolean;
  } | null;
  const latest = await appStub(rc.env, appId).getLatest();
  const base = latest.version?.sourceFiles ?? {};
  if (!latest.version?.sourceFiles) {
    return jsonError("no_version_with_sources", 404);
  }
  const files = mergeSources(base, body?.files ?? {});
  const check = await callCheck(
    rc.env,
    appId,
    files,
    body?.forceCold !== false
  );
  // Records nothing. This is a dry-run probe against the latest version, not
  // a commit — it mints no version, so there is no attempt to attach a result
  // to. Persisting it would put a status in the log that never gated anything.
  const pass = checkPasses(check.body);
  return Response.json({
    ok: check.http < 500 && Boolean(check.body?.ok),
    appId,
    baseVersionId: latest.version.id,
    wallMs: check.wallMs,
    publishGate: pass,
    check: check.body,
  });
}

async function handleCommit(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    files?: Record<string, string | null>;
  } | null;
  if (!body?.files || Object.keys(body.files).length === 0) {
    return jsonError("files overlay required");
  }
  const stub = appStub(rc.env, appId);
  const live = await stub.getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return jsonError("no_live_version", 404);
  }
  const files = mergeSources(live.version.sourceFiles, body.files);
  return enqueueCommit(
    rc.env,
    rc.ctx,
    appId,
    "commit",
    files,
    live.liveVersionId
  );
}

async function handleRevert(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    versionId?: string;
  } | null;
  if (!body?.versionId) {
    return jsonError("versionId required");
  }
  // Stays synchronous: revert restores an already-checked version, so there is
  // nothing to wait on. It still records an attempt (see `AppDO.revertTo`),
  // which is why no status write happens here.
  const result = await appStub(rc.env, appId).revertTo(body.versionId);
  if (!result.ok) {
    return Response.json(
      { appId, ...result },
      { status: result.error === "attempt_in_flight" ? 409 : 404 }
    );
  }
  return Response.json({ appId, action: "revert", ...result });
}

function handleHealth(rc: RouteCtx): Response {
  return Response.json({
    ok: true,
    service: "sfab-lite-factory",
    phase: "s2d",
    bindings: {
      check: Boolean(rc.env.CHECK),
      lint: Boolean(rc.env.LINT),
      loader: Boolean(rc.env.LOADER),
    },
    seedFiles: Object.keys(TEMPLATE_SEED.sourceFiles).length,
    seedMigrations: TEMPLATE_SEED.migrations.length,
    // better-auth does not unregister email/password routes when disabled —
    // it returns 400 at handler entry — so a UI cannot probe for a 404 and
    // must be told the flag by the server.
    passwordAuth: passwordAuthEnabled(rc.env),
  });
}

/**
 * Public factory config for the sign-in UI. Unauthenticated on purpose:
 * better-auth does not unregister email/password routes when disabled — it
 * returns 400 at handler entry — so a UI cannot probe for a 404 and must be
 * told the flag by the server. Do not re-read env client-side.
 */
function handleApiConfig(rc: RouteCtx): Response {
  return Response.json({
    passwordAuth: passwordAuthEnabled(rc.env),
  });
}

function handleAuth(rc: RouteCtx): Promise<Response> | Response {
  const auth = createAuth(rc.env, rc.url.origin);
  return auth.handler(rc.request);
}

function handleKernel(rc: RouteCtx): Response {
  const rest = rc.match[1] ?? "";
  const res = serveKernel(rc.request, rest);
  return res ?? new Response("unknown kernel path\n", { status: 404 });
}

function handleSubApp(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  let rest = rc.match[2] ?? "";
  let mode: "live" | "preview" = "live";
  if (rest === "preview" || rest.startsWith("preview/")) {
    mode = "preview";
    rest = rest === "preview" ? "" : rest.slice("preview/".length);
  }
  return serveSubApp(rc.request, rc.env, rc.ctx, appId, rest, mode);
}

const RE_ADMIN_APP = /^\/admin\/apps\/([^/]+)$/;

/** Everything reachable without a factory credential. */
const PUBLIC_ROUTES: PublicRoute[] = [
  { method: "GET", pattern: /^\/api\/config$/, handler: handleApiConfig },
  { method: "*", pattern: /^\/api\/auth(?:\/.*)?$/, handler: handleAuth },
  { method: ["GET", "HEAD"], pattern: RE_KERNEL, handler: handleKernel },
  // A generated app served to its own end users — see `tenancy.ts` on why
  // this one is addressed by app id alone.
  { method: "*", pattern: RE_SUBAPP, handler: handleSubApp },
];

const ADMIN_ROUTES: AdminRoute[] = [
  {
    method: "GET",
    pattern: /^\/admin\/health$/,
    scope: "factory",
    handler: handleHealth,
  },
  {
    method: "GET",
    pattern: /^\/admin\/apps$/,
    scope: "factory",
    handler: handleListApps,
  },
  {
    method: "POST",
    pattern: /^\/admin\/apps$/,
    scope: "factory",
    handler: handleCreateApp,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_TOUCH,
    scope: "app",
    handler: handleTouch,
  },
  { method: "POST", pattern: RE_ADMIN_SQL, scope: "app", handler: handleSql },
  {
    method: "GET",
    pattern: RE_ADMIN_VERSIONS,
    scope: "app",
    handler: handleListVersions,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_ATTEMPT,
    scope: "app",
    handler: handleGetAttempt,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_ATTEMPTS,
    scope: "app",
    handler: handleListAttempts,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_CHECK,
    scope: "app",
    handler: handleCheck,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_COMMIT,
    scope: "app",
    handler: handleCommit,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_REVERT,
    scope: "app",
    handler: handleRevert,
  },
  // After `/admin/apps/:id/…` routes so a looser pattern cannot steal them.
  { method: "GET", pattern: RE_ADMIN_APP, scope: "app", handler: handleGetApp },
];

function matchRoute<
  R extends { method: string | readonly string[]; pattern: RegExp },
>(
  routes: R[],
  method: string,
  pathname: string
): { route: R; match: RegExpMatchArray } | null {
  for (const route of routes) {
    if (route.method !== "*" && !methodMatches(route.method, method)) {
      continue;
    }
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, match };
    }
  }
  return null;
}

const NOT_FOUND_BODY =
  "sfab-lite factory: /admin/health | /admin/apps | .../commit | .../check | .../revert | .../attempts\n";

/**
 * Dispatch an authenticated `/admin/*` request.
 *
 * Credential first, route second — deliberately. Resolving the actor before
 * matching means an unknown `/admin/…` path answers 401 rather than 404 to an
 * anonymous caller, so the admin surface is not enumerable by probing.
 */
async function dispatchAdmin(rc: RequestCtx): Promise<Response> {
  const db = createDb(rc.env);
  const actor = await resolveActor(rc.env, db, rc.request, rc.url.origin);
  if (actor instanceof Response) {
    return actor;
  }

  const hit = matchRoute(ADMIN_ROUTES, rc.request.method, rc.url.pathname);
  if (!hit) {
    return new Response(NOT_FOUND_BODY, { status: 404 });
  }

  const base: AdminCtx = { ...rc, match: hit.match, actor };
  if (hit.route.scope === "factory") {
    return await hit.route.handler(base);
  }

  const appId = decodeURIComponent(hit.match[1] ?? "");
  const denied = await requireAppAccess(db, actor, appId);
  if (denied) {
    return denied;
  }
  return await hit.route.handler({ ...base, appId });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const rc: RequestCtx = { request, env, ctx, url };

    const publicHit = matchRoute(PUBLIC_ROUTES, request.method, url.pathname);
    if (publicHit) {
      return await publicHit.route.handler({ ...rc, match: publicHit.match });
    }

    if (url.pathname.startsWith("/admin")) {
      return await dispatchAdmin(rc);
    }

    return new Response(NOT_FOUND_BODY, { status: 404 });
  },
};
