/**
 * Serve a sub-app at /a/:appId/* (live) or /a/:appId/preview/:prNumber/*
 * (that PR's preview_sha build).
 *
 * Live pointer is D1 `live_sha` → immutable build in CODE_R2.
 * Preview is per-PR: pull_request.preview_sha → BuildStore by sha.
 * AppDO is runtime SQLite only (seed credentials + SQL).
 */
import { SERVER_SURFACE_HASH } from "@sfab-lite/kernel";
import type { AppDO } from "./app-do.js";
import type { AppBuild } from "./build-store.js";
import { getLiveSha } from "./cd.js";
import { getPullRequestByNumber } from "./forge.js";
import { kernelModules } from "./kernel-modules.js";
import { createR2BuildStore } from "./r2-build-store.js";
import type { ScopedSqlProps } from "./scoped-sql.js";

const LEADING_SLASHES_RE = /^\/+/;

function contentType(path: string): string {
  if (path.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (path.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (path.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

interface HostExports {
  ScopedSql: (opts: { props: ScopedSqlProps }) => unknown;
}

export type ServeMode = "live" | "preview";

export interface ServePreviewOpts {
  prNumber: number;
}

async function loadBuild(
  env: Env,
  appId: string,
  mode: ServeMode,
  preview?: ServePreviewOpts
): Promise<AppBuild | null> {
  let sha: string | null = null;
  if (mode === "preview") {
    if (!preview?.prNumber) {
      return null;
    }
    const pr = await getPullRequestByNumber(env, appId, preview.prNumber);
    sha = pr?.previewSha ?? null;
  } else {
    sha = await getLiveSha(env, appId);
  }
  if (!sha) {
    return null;
  }
  return createR2BuildStore(env).getBuild(appId, sha);
}

function pathPrefixFor(
  appId: string,
  mode: ServeMode,
  preview?: ServePreviewOpts
): string {
  if (mode === "preview" && preview?.prNumber != null) {
    return `/a/${encodeURIComponent(appId)}/preview/${preview.prNumber}`;
  }
  return `/a/${encodeURIComponent(appId)}`;
}

function buildPathContext(
  request: Request,
  appId: string,
  restPath: string,
  mode: ServeMode,
  preview?: ServePreviewOpts
): { rest: string; publicBase: string } {
  const url = new URL(request.url);
  const rest = restPath.replace(LEADING_SLASHES_RE, "");
  const pathPrefix = pathPrefixFor(appId, mode, preview);
  return { rest, publicBase: `${url.origin}${pathPrefix}` };
}

async function serveApiRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  appId: string,
  build: AppBuild,
  rest: string,
  publicBase: string,
  mode: ServeMode,
  stub: DurableObjectStub<AppDO>,
  preview?: ServePreviewOpts
): Promise<Response> {
  const secret = env.APP_BETTER_AUTH_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "APP_BETTER_AUTH_SECRET missing on host" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const innerUrl = new URL(`/${rest}${url.search}`, url.origin);
  const workerKey = `app:${appId}:${mode}:${preview?.prNumber ?? "live"}:${build.sha}`;

  const ex = ctx.exports as unknown as HostExports;
  const worker = env.LOADER.get(workerKey, async () => ({
    compatibilityDate: "2026-07-23",
    compatibilityFlags: ["nodejs_compat"],
    mainModule: "index.js",
    modules: {
      ...kernelModules(),
      "index.js": build.serverBundle,
    },
    env: {
      DB: ex.ScopedSql({ props: { appId } satisfies ScopedSqlProps }),
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: new URL(publicBase).origin,
      APP_BASE_PATH: pathPrefixFor(appId, mode, preview),
      SEED_TOKEN: (await stub.seedCredentials()).token,
    },
    globalOutbound: null,
  }));

  const headers = new Headers(request.headers);
  headers.set("Origin", url.origin);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  return worker.getEntrypoint().fetch(new Request(innerUrl, init));
}

function resolveStaticAsset(
  build: AppBuild,
  rest: string
): { assetKey: string; body: string } | null {
  let assetKey = rest === "" || rest.endsWith("/") ? "index.html" : rest;
  if (assetKey.startsWith("./")) {
    assetKey = assetKey.slice(2);
  }

  let body = build.assets[assetKey];
  if (body == null && !assetKey.includes(".")) {
    body = build.assets["index.html"];
    assetKey = "index.html";
  }
  if (body == null) {
    return null;
  }

  return { assetKey, body };
}

function injectPublicBase(body: string, publicBase: string): string {
  const boot = `<script>window.__SFAB_PUBLIC_BASE__=${JSON.stringify(publicBase)};</script>`;
  if (body.includes("</head>")) {
    return body.replace("</head>", `${boot}</head>`);
  }
  return boot + body;
}

function serveStaticAsset(
  build: AppBuild,
  rest: string,
  publicBase: string
): Response {
  const resolved = resolveStaticAsset(build, rest);
  if (!resolved) {
    const assetKey = rest === "" || rest.endsWith("/") ? "index.html" : rest;
    return new Response(`not found: ${assetKey}`, { status: 404 });
  }

  let { assetKey, body } = resolved;
  if (assetKey === "index.html") {
    body = injectPublicBase(body, publicBase);
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType(assetKey),
      "cache-control":
        assetKey === "index.html" ? "no-store" : "public, max-age=60",
    },
  });
}

export async function serveSubApp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  appId: string,
  restPath: string,
  mode: ServeMode = "live",
  preview?: ServePreviewOpts
): Promise<Response> {
  if (
    mode === "preview" &&
    (preview?.prNumber == null || preview.prNumber < 1)
  ) {
    return Response.json(
      { ok: false, error: "preview_pr_required", appId },
      { status: 404 }
    );
  }

  const stub = env.APP_DO.get(env.APP_DO.idFromName(appId));
  const build = await loadBuild(env, appId, mode, preview);

  if (!build) {
    return Response.json(
      {
        ok: false,
        error: mode === "preview" ? "no_preview_build" : "no_live_build",
        appId,
        ...(preview?.prNumber == null ? {} : { prNumber: preview.prNumber }),
      },
      { status: 404 }
    );
  }

  if (
    build.serverSurfaceHash != null &&
    build.serverSurfaceHash !== SERVER_SURFACE_HASH
  ) {
    return Response.json(
      {
        ok: false,
        error: "server_surface_mismatch",
        appId,
        sha: build.sha,
        buildServerSurface: build.serverSurfaceHash,
        hostServerSurface: SERVER_SURFACE_HASH,
      },
      { status: 409 }
    );
  }

  const { rest, publicBase } = buildPathContext(
    request,
    appId,
    restPath,
    mode,
    preview
  );

  const withShaHeader = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set("X-Sfab-Live-Sha", build.sha);
    headers.set("X-Sfab-Serve", mode);
    if (preview?.prNumber != null) {
      headers.set("X-Sfab-Preview-Pr", String(preview.prNumber));
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  if (rest === "api" || rest.startsWith("api/")) {
    const res = await serveApiRoute(
      request,
      env,
      ctx,
      appId,
      build,
      rest,
      publicBase,
      mode,
      stub,
      preview
    );
    return withShaHeader(res);
  }

  return withShaHeader(serveStaticAsset(build, rest, publicBase));
}
