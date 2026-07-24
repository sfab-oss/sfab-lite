/**
 * @sfab-lite/factory — host worker (S2d).
 *
 * Commit blocks on check (option 1). A version only exists if checks
 * passed, and on creation it is live. Revert appends a new version.
 *
 * Admin: ungated when ADMIN_TOKEN unset (local). When set, every
 * `/admin/*` requires matching X-Admin-Token.
 */
import type { CheckResult, LintResult } from "@sfab-lite/core";
import { mergeSources } from "@sfab-lite/core";
import type { VersionRecord } from "./app-do.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";
import TEMPLATE_SEED from "./generated/seed.json" with { type: "json" };
import type { ScopedSqlProps } from "./scoped-sql.js";
import { serveSubApp } from "./serve.js";
import { serveKernel } from "./serve-kernel.js";

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
  setCheckStatus: (
    versionId: string,
    status: "pending" | "pass" | "fail" | "error",
    payload?: unknown
  ) => Promise<{ ok: true; versionId: string; status: string }>;
  getCheckStatus: (versionId: string) => Promise<{
    ok: true;
    versionId: string;
    status: "pending" | "pass" | "fail" | "error" | "missing";
    updatedAt: number | null;
    payload: unknown;
  }>;
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
function adminUnauthorized(env: Env, request: Request): Response | null {
  if (!env.ADMIN_TOKEN) {
    return null;
  }
  const got = request.headers.get("X-Admin-Token");
  if (got === env.ADMIN_TOKEN) {
    return null;
  }
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

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
 * Lint + compile + check (blocking). On pass, append a live version.
 * On fail, no version row is written.
 */
async function commitSources(
  env: Env,
  appId: string,
  files: Record<string, string>,
  parentId: string | null,
  opts?: { forceColdCheck?: boolean }
): Promise<Response> {
  const stub = appStub(env, appId);
  const tAll0 = Date.now();

  const lint = await callLint(env, appId, files);
  if (lint.http >= 500 || lint.body?.ok === false) {
    return Response.json(
      {
        ok: false,
        error: "lint_failed",
        appId,
        parentId,
        lintHttp: lint.http,
        lintWallMs: lint.wallMs,
        lint: lint.body,
      },
      { status: 502 }
    );
  }

  let compiled: Awaited<ReturnType<typeof compileAll>>;
  try {
    compiled = await compileAll(files);
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: "compile_failed",
        appId,
        parentId,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      { status: 500 }
    );
  }

  const check = await callCheck(
    env,
    appId,
    files,
    opts?.forceColdCheck ?? false
  );
  const pass = check.http < 500 && checkPasses(check.body);
  if (!pass) {
    return Response.json(
      {
        ok: false,
        error: "check_failed",
        appId,
        parentId,
        lintWallMs: lint.wallMs,
        checkHttp: check.http,
        checkWallMs: check.wallMs,
        check: check.body,
        publishGate: false,
        totalMs: Date.now() - tAll0,
      },
      { status: 422 }
    );
  }

  const put = await stub.putVersion({
    parentId,
    sourceFiles: files,
    serverBundle: compiled.compiled.serverBundle,
    assets: compiled.assets,
    kernelVersion: compiled.compiled.kernelVersion,
  });
  await stub.setCheckStatus(put.id, "pass", {
    ...(check.body ?? {}),
    http: check.http,
    wallMs: check.wallMs,
    publishGate: true,
  });

  const lintDiagCount = (lint.body?.files ?? []).reduce(
    (n, f) => n + (f.diagnosticCount ?? 0),
    0
  );

  return Response.json({
    ok: true,
    appId,
    versionId: put.id,
    parentId,
    liveVersionId: put.liveVersionId,
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
  });
}

// --- Module-scope route patterns (compiled once) ---

const RE_KERNEL = /^\/kernel\/(.+)$/;
const RE_SUBAPP = /^\/a\/([^/]+)(?:\/(.*))?$/;
const RE_ADMIN_TOUCH = /^\/admin\/apps\/([^/]+)\/touch$/;
const RE_ADMIN_SQL = /^\/admin\/apps\/([^/]+)\/sql$/;
const RE_ADMIN_VERSIONS = /^\/admin\/apps\/([^/]+)\/versions$/;
const RE_ADMIN_CHECK_STATUS = /^\/admin\/apps\/([^/]+)\/check-status$/;
const RE_ADMIN_CHECK = /^\/admin\/apps\/([^/]+)\/check$/;
const RE_ADMIN_COMMIT = /^\/admin\/apps\/([^/]+)\/commit$/;
const RE_ADMIN_REVERT = /^\/admin\/apps\/([^/]+)\/revert$/;

interface RouteCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  match: RegExpMatchArray;
}

interface Route {
  method: string | readonly string[];
  pattern: RegExp;
  handler: (rc: RouteCtx) => Promise<Response> | Response;
}

function methodMatches(
  allowed: string | readonly string[],
  method: string
): boolean {
  if (typeof allowed === "string") {
    return allowed === method;
  }
  return allowed.includes(method);
}

async function handleCreateApp(rc: RouteCtx): Promise<Response> {
  const body = (await rc.request.json().catch(() => null)) as {
    appId?: string;
  } | null;
  const appId = body?.appId?.trim();
  if (!appId) {
    return jsonError("appId required");
  }

  const stub = appStub(rc.env, appId);
  await stub.bootstrap(TEMPLATE_SEED.migrations);
  const live = await stub.getLive();
  if (live.liveVersionId) {
    const touch = await stub.touch();
    return Response.json({
      ok: true,
      appId,
      alreadySeeded: true,
      liveVersionId: live.liveVersionId,
      touch,
    });
  }

  const seedCommit = await commitSources(
    rc.env,
    appId,
    TEMPLATE_SEED.sourceFiles,
    null,
    { forceColdCheck: true }
  );
  const seedBody = (await seedCommit.json()) as Record<string, unknown>;
  if (!seedCommit.ok) {
    return Response.json(
      { ok: false, error: "seed_failed", appId, ...seedBody },
      { status: seedCommit.status }
    );
  }
  const touch = await stub.touch();
  return Response.json({
    ok: true,
    appId,
    seeded: true,
    touch,
    ...seedBody,
  });
}

async function handleTouch(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  const touch = await appStub(rc.env, appId).touch();
  return Response.json({ ok: true, appId, touch });
}

async function handleSql(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
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

async function handleListVersions(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  const listed = await appStub(rc.env, appId).listVersions();
  return Response.json({ appId, ...listed });
}

async function handleCheckStatus(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  const versionId = rc.url.searchParams.get("versionId")?.trim();
  if (!versionId) {
    return jsonError("versionId query required");
  }
  const st = await appStub(rc.env, appId).getCheckStatus(versionId);
  return Response.json({
    ok: true,
    appId,
    versionId: st.versionId,
    status: st.status,
    updatedAt: st.updatedAt,
    payload: st.payload,
  });
}

async function handleCheck(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
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
  const pass = checkPasses(check.body);
  if (check.body && check.http < 500) {
    await appStub(rc.env, appId).setCheckStatus(
      latest.version.id,
      pass ? "pass" : "fail",
      {
        ...(check.body ?? {}),
        http: check.http,
        wallMs: check.wallMs,
        publishGate: pass,
      }
    );
  }
  return Response.json({
    ok: check.http < 500 && Boolean(check.body?.ok),
    appId,
    baseVersionId: latest.version.id,
    wallMs: check.wallMs,
    publishGate: pass,
    check: check.body,
  });
}

async function handleCommit(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
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
  return commitSources(rc.env, appId, files, live.liveVersionId);
}

async function handleRevert(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  const body = (await rc.request.json().catch(() => null)) as {
    versionId?: string;
  } | null;
  if (!body?.versionId) {
    return jsonError("versionId required");
  }
  const result = await appStub(rc.env, appId).revertTo(body.versionId);
  if (!result.ok) {
    return Response.json({ appId, ...result }, { status: 404 });
  }
  await appStub(rc.env, appId).setCheckStatus(result.id, "pass", {
    source: "revert",
    restoredFrom: result.restoredFrom,
    trusted: true,
  });
  return Response.json({ appId, action: "revert", ...result });
}

function handleHealth(_rc: RouteCtx): Response {
  return Response.json({
    ok: true,
    service: "sfab-lite-factory",
    phase: "s2d",
    bindings: {
      check: Boolean(_rc.env.CHECK),
      lint: Boolean(_rc.env.LINT),
      loader: Boolean(_rc.env.LOADER),
    },
    seedFiles: Object.keys(TEMPLATE_SEED.sourceFiles).length,
    seedMigrations: TEMPLATE_SEED.migrations.length,
  });
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

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/admin\/health$/, handler: handleHealth },
  { method: ["GET", "HEAD"], pattern: RE_KERNEL, handler: handleKernel },
  { method: "*", pattern: RE_SUBAPP, handler: handleSubApp },
  { method: "POST", pattern: /^\/admin\/apps$/, handler: handleCreateApp },
  { method: "GET", pattern: RE_ADMIN_TOUCH, handler: handleTouch },
  { method: "POST", pattern: RE_ADMIN_SQL, handler: handleSql },
  { method: "GET", pattern: RE_ADMIN_VERSIONS, handler: handleListVersions },
  {
    method: "GET",
    pattern: RE_ADMIN_CHECK_STATUS,
    handler: handleCheckStatus,
  },
  { method: "POST", pattern: RE_ADMIN_CHECK, handler: handleCheck },
  { method: "POST", pattern: RE_ADMIN_COMMIT, handler: handleCommit },
  { method: "POST", pattern: RE_ADMIN_REVERT, handler: handleRevert },
];

function matchRoute(
  method: string,
  pathname: string
): { route: Route; match: RegExpMatchArray } | null {
  for (const route of ROUTES) {
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

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/admin")) {
      const denied = adminUnauthorized(env, request);
      if (denied) {
        return denied;
      }
    }

    const hit = matchRoute(request.method, url.pathname);
    if (hit) {
      return await hit.route.handler({
        request,
        env,
        ctx,
        url,
        match: hit.match,
      });
    }

    return new Response(
      "sfab-lite factory: /admin/health | /admin/apps | .../commit | .../check | .../revert\n",
      { status: 404 }
    );
  },
};
