/**
 * Serve a sub-app at /a/:appId/* (live) or /a/:appId/preview/* (latest).
 * Routing seam is path-based; host-header routing can replace the matcher later.
 *
 * No `/api/` string rewrite — the template builds URLs from
 * `window.__SFAB_PUBLIC_BASE__`.
 */
import { SERVER_SURFACE_HASH } from "@sfab-lite/kernel";
import type { AppDO, VersionRecord } from "./app-do.js";
import { kernelModules } from "./kernel-modules.js";
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

async function loadVersion(
  stub: DurableObjectStub<AppDO>,
  mode: ServeMode
): Promise<VersionRecord | null> {
  if (mode === "preview") {
    const latest = await stub.getLatest();
    return latest.version;
  }
  const live = await stub.getLive();
  return live.version;
}

function buildPathContext(
  request: Request,
  appId: string,
  restPath: string,
  mode: ServeMode
): { rest: string; publicBase: string } {
  const url = new URL(request.url);
  const rest = restPath.replace(LEADING_SLASHES_RE, "");
  const pathPrefix =
    mode === "preview"
      ? `/a/${encodeURIComponent(appId)}/preview`
      : `/a/${encodeURIComponent(appId)}`;
  return { rest, publicBase: `${url.origin}${pathPrefix}` };
}

async function serveApiRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  appId: string,
  version: VersionRecord,
  rest: string,
  publicBase: string,
  mode: ServeMode
): Promise<Response> {
  // `APP_BETTER_AUTH_SECRET` on the host, injected into the sub-app as plain
  // `BETTER_AUTH_SECRET` below. The host now runs better-auth for the factory
  // itself, so the unqualified name belongs to the factory — per GLOSSARY.md,
  // factory terms go unqualified and app-side ones take the `app` qualifier.
  // The sub-app's own variable name is unchanged; only the host binding moved.
  const secret = env.APP_BETTER_AUTH_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "APP_BETTER_AUTH_SECRET missing on host" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const innerUrl = new URL(`/${rest}${url.search}`, url.origin);
  const workerKey = `app:${appId}:${mode}:${version.id}`;

  const ex = ctx.exports as unknown as HostExports;
  const worker = env.LOADER.get(workerKey, () => ({
    compatibilityDate: "2026-07-23",
    compatibilityFlags: ["nodejs_compat"],
    mainModule: "index.js",
    modules: {
      ...kernelModules(),
      "index.js": version.serverBundle,
    },
    env: {
      DB: ex.ScopedSql({ props: { appId } satisfies ScopedSqlProps }),
      BETTER_AUTH_SECRET: secret,
      // Origin only — LOADER sees stripped `/api/auth/*` paths.
      BETTER_AUTH_URL: url.origin,
      // Which is exactly why the mount has to travel separately: the app
      // scopes its cookies to this path so it cannot clobber the console's
      // session, or another app's, on the origin they all share. Deliberately
      // the *live* prefix in both modes — preview is a subpath of it, so the
      // two keep sharing one session rather than asking for a second sign-in.
      APP_BASE_PATH: `/a/${encodeURIComponent(appId)}`,
    },
    globalOutbound: null,
  }));

  const headers = new Headers(request.headers);
  headers.set("origin", publicBase);

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
  version: VersionRecord,
  rest: string
): { assetKey: string; body: string } | null {
  let assetKey = rest === "" || rest.endsWith("/") ? "index.html" : rest;
  if (assetKey.startsWith("./")) {
    assetKey = assetKey.slice(2);
  }

  let body = version.assets[assetKey];
  if (body == null && !assetKey.includes(".")) {
    body = version.assets["index.html"];
    assetKey = "index.html";
  }
  if (body == null) {
    return null;
  }

  if (assetKey === "index.html") {
    return { assetKey, body };
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
  version: VersionRecord,
  rest: string,
  publicBase: string
): Response {
  const resolved = resolveStaticAsset(version, rest);
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
  mode: ServeMode = "live"
): Promise<Response> {
  const stub = env.APP_DO.get(env.APP_DO.idFromName(appId));
  const version = await loadVersion(stub, mode);

  if (!version) {
    return Response.json(
      {
        ok: false,
        error: mode === "preview" ? "no_version" : "no_live_version",
        appId,
      },
      { status: 404 }
    );
  }

  // Pre-column versions have no stored hash. Serving them is deliberate —
  // 409ing would recreate the fleet-blanking bug this guard replaces.
  if (
    version.serverSurfaceHash != null &&
    version.serverSurfaceHash !== SERVER_SURFACE_HASH
  ) {
    return Response.json(
      {
        ok: false,
        error: "server_surface_mismatch",
        appId,
        versionId: version.id,
        versionServerSurface: version.serverSurfaceHash,
        hostServerSurface: SERVER_SURFACE_HASH,
      },
      { status: 409 }
    );
  }

  const { rest, publicBase } = buildPathContext(request, appId, restPath, mode);

  const withVersionHeader = (res: Response): Response => {
    const headers = new Headers(res.headers);
    headers.set("X-Sfab-Version", version.id);
    headers.set("X-Sfab-Serve", mode);
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
      version,
      rest,
      publicBase,
      mode
    );
    return withVersionHeader(res);
  }

  return withVersionHeader(serveStaticAsset(version, rest, publicBase));
}
