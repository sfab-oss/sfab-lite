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
import { AppDO } from "./app-do.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";
import TEMPLATE_SEED from "./generated/seed.json" with { type: "json" };
import { ScopedSql, type ScopedSqlProps } from "./scoped-sql.js";
import { serveSubApp } from "./serve.js";
import { serveKernel } from "./serve-kernel.js";

export { AppDO, ScopedSql };

/** Explicit stub surface — DO Rpc generics erase method returns under tsc alone. */
type AppStub = {
  touch(): Promise<{
    ok: true;
    appIdHint: string;
    appSchemaVersion: number;
    userCount: number | null;
    liveVersionId: string | null;
  }>;
  bootstrap(migrations: { id: string; sql: string }[]): Promise<{
    ok: true;
    bootstrapped: boolean;
    appSchemaVersion: number;
    bootstrapMs: number;
  }>;
  putVersion(input: {
    id: string;
    parentId: string | null;
    sourceFiles: Record<string, string>;
    serverBundle: string;
    assets: Record<string, string>;
    kernelVersion: string;
  }): Promise<{
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  }>;
  revertTo(versionId: string): Promise<
    | {
        ok: true;
        id: string;
        liveVersionId: string;
        parentId: string;
        restoredFrom: string;
      }
    | { ok: false; error: string }
  >;
  listVersions(): Promise<{
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
  getVersion(
    versionId: string
  ): Promise<{ ok: true; version: VersionRecord | null }>;
  getLatest(): Promise<{ ok: true; version: VersionRecord | null }>;
  getLive(): Promise<{
    ok: true;
    liveVersionId: string | null;
    version: VersionRecord | null;
  }>;
  setCheckStatus(
    versionId: string,
    status: "pending" | "pass" | "fail" | "error",
    payload?: unknown
  ): Promise<{ ok: true; versionId: string; status: string }>;
  getCheckStatus(versionId: string): Promise<{
    ok: true;
    versionId: string;
    status: "pending" | "pass" | "fail" | "error" | "missing";
    updatedAt: number | null;
    payload: unknown;
  }>;
};

function appStub(env: Env, appId: string): AppStub {
  return env.APP_DO.get(env.APP_DO.idFromName(appId)) as unknown as AppStub;
}

/** ctx.exports typing for WorkerEntrypoint classes isn't inferred by tsc alone. */
type HostExports = {
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
};

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

  const versionId = `v-${Date.now()}`;
  const put = await stub.putVersion({
    id: versionId,
    parentId,
    sourceFiles: files,
    serverBundle: compiled.compiled.serverBundle,
    assets: compiled.assets,
    kernelVersion: compiled.compiled.kernelVersion,
  });
  await stub.setCheckStatus(versionId, "pass", {
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
    versionId,
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

    if (url.pathname === "/admin/health") {
      return Response.json({
        ok: true,
        service: "sfab-lite-factory",
        phase: "s2d",
        bindings: {
          check: Boolean(env.CHECK),
          lint: Boolean(env.LINT),
          loader: Boolean(env.LOADER),
        },
        seedFiles: Object.keys(TEMPLATE_SEED.sourceFiles).length,
        seedMigrations: TEMPLATE_SEED.migrations.length,
      });
    }

    // Client kernel chunks: /kernel/:ver/client/:file.js
    {
      const m = url.pathname.match(/^\/kernel\/(.+)$/);
      if (m?.[1] && (request.method === "GET" || request.method === "HEAD")) {
        const res = serveKernel(request, m[1]);
        if (res) {
          return res;
        }
      }
    }

    // Path-based sub-app routing: /a/:appId/* and /a/:appId/preview/*
    {
      const m = url.pathname.match(/^\/a\/([^/]+)(?:\/(.*))?$/);
      if (m?.[1]) {
        const appId = decodeURIComponent(m[1]);
        let rest = m[2] ?? "";
        let mode: "live" | "preview" = "live";
        if (rest === "preview" || rest.startsWith("preview/")) {
          mode = "preview";
          rest = rest === "preview" ? "" : rest.slice("preview/".length);
        }
        return serveSubApp(request, env, ctx, appId, rest, mode);
      }
    }

    // POST /admin/apps  { appId } — create + seed (check-gated commit of template)
    if (url.pathname === "/admin/apps" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        appId?: string;
      } | null;
      const appId = body?.appId?.trim();
      if (!appId) {
        return jsonError("appId required");
      }

      const stub = appStub(env, appId);
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
        env,
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

    // GET /admin/apps/:appId/touch
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/touch$/);
      if (m?.[1] && request.method === "GET") {
        const appId = decodeURIComponent(m[1]);
        const touch = await appStub(env, appId).touch();
        return Response.json({ ok: true, appId, touch });
      }
    }

    // POST /admin/apps/:appId/sql  { query, binds? }
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/sql$/);
      if (m?.[1] && request.method === "POST") {
        const appId = decodeURIComponent(m[1]);
        const body = (await request.json().catch(() => null)) as {
          query?: string;
          binds?: unknown[];
        } | null;
        if (!body?.query) {
          return jsonError("query required");
        }
        const db = scopedDb(ctx, appId);
        const ping = await db.pingScope();
        const result = await db
          .prepare(body.query)
          .bind(...(body.binds ?? []))
          .all();
        return Response.json({ ok: true, appId, ping, result });
      }
    }

    // GET /admin/apps/:appId/versions
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/versions$/);
      if (m?.[1] && request.method === "GET") {
        const appId = decodeURIComponent(m[1]);
        const listed = await appStub(env, appId).listVersions();
        return Response.json({ appId, ...listed });
      }
    }

    // GET /admin/apps/:appId/check-status?versionId=
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/check-status$/);
      if (m?.[1] && request.method === "GET") {
        const appId = decodeURIComponent(m[1]);
        const versionId = url.searchParams.get("versionId")?.trim();
        if (!versionId) {
          return jsonError("versionId query required");
        }
        const st = await appStub(env, appId).getCheckStatus(versionId);
        return Response.json({
          ok: true,
          appId,
          versionId: st.versionId,
          status: st.status,
          updatedAt: st.updatedAt,
          payload: st.payload,
        });
      }
    }

    // POST /admin/apps/:appId/check  — proxy to CHECK worker (latency harness)
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/check$/);
      if (m?.[1] && request.method === "POST") {
        const appId = decodeURIComponent(m[1]);
        const body = (await request.json().catch(() => null)) as {
          files?: Record<string, string | null>;
          forceCold?: boolean;
        } | null;
        const latest = await appStub(env, appId).getLatest();
        const base = latest.version?.sourceFiles ?? {};
        if (!latest.version?.sourceFiles) {
          return jsonError("no_version_with_sources", 404);
        }
        const files = mergeSources(base, body?.files ?? {});
        const check = await callCheck(
          env,
          appId,
          files,
          body?.forceCold !== false
        );
        const pass = checkPasses(check.body);
        if (check.body && check.http < 500) {
          await appStub(env, appId).setCheckStatus(
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
    }

    // POST /admin/apps/:appId/commit  — lint + compile + check (blocking) → live
    // POST /admin/apps/:appId/edit    — same (commit vocabulary; edit kept as alias)
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/(commit|edit)$/);
      if (m?.[1] && m[2] && request.method === "POST") {
        const appId = decodeURIComponent(m[1]);
        const body = (await request.json().catch(() => null)) as {
          files?: Record<string, string | null>;
        } | null;
        if (!body?.files || Object.keys(body.files).length === 0) {
          return jsonError("files overlay required");
        }
        const stub = appStub(env, appId);
        const live = await stub.getLive();
        if (!(live.version?.sourceFiles && live.liveVersionId)) {
          return jsonError("no_live_version", 404);
        }
        const files = mergeSources(live.version.sourceFiles, body.files);
        return commitSources(env, appId, files, live.liveVersionId);
      }
    }

    // POST /admin/apps/:appId/revert  { versionId } — new version = old content
    {
      const m = url.pathname.match(/^\/admin\/apps\/([^/]+)\/revert$/);
      if (m?.[1] && request.method === "POST") {
        const appId = decodeURIComponent(m[1]);
        const body = (await request.json().catch(() => null)) as {
          versionId?: string;
        } | null;
        if (!body?.versionId) {
          return jsonError("versionId required");
        }
        const result = await appStub(env, appId).revertTo(body.versionId);
        if (!result.ok) {
          return Response.json({ appId, ...result }, { status: 404 });
        }
        await appStub(env, appId).setCheckStatus(result.id, "pass", {
          source: "revert",
          restoredFrom: result.restoredFrom,
          trusted: true,
        });
        return Response.json({ appId, action: "revert", ...result });
      }
    }

    return new Response(
      "sfab-lite factory: /admin/health | /admin/apps | .../commit | .../check | .../revert\n",
      { status: 404 }
    );
  },
};
