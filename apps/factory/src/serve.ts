/**
 * Serve a sub-app at /a/:appId/* (live) or /a/:appId/preview/* (latest).
 * Routing seam is path-based; host-header routing can replace the matcher later.
 *
 * No `/api/` string rewrite — the template builds URLs from
 * `window.__SFAB_PUBLIC_BASE__` (S1).
 */
import {
  KERNEL_BETTER_AUTH,
  KERNEL_DRIZZLE,
  KERNEL_HONO,
  KERNEL_JSX_RUNTIME,
  KERNEL_REACT,
  KERNEL_REACT_DOM,
  KERNEL_REACT_DOM_SERVER,
  KERNEL_VERSION,
  KERNEL_ZOD,
} from "@sfab-lite/kernel";
import type { VersionRecord } from "./app-do.js";
import type { ScopedSqlProps } from "./scoped-sql.js";

const KERNEL_PATHS = {
  react: "react.js",
  jsxRuntime: "jsx-runtime.js",
  reactDom: "react-dom.js",
  reactDomServer: "react-dom-server.js",
  drizzle: "drizzle-orm.js",
  betterAuth: "better-auth.js",
  hono: "hono.js",
  zod: "zod.js",
} as const;

function kernelModules(): Record<string, { js: string }> {
  return {
    [KERNEL_PATHS.react]: { js: KERNEL_REACT },
    [KERNEL_PATHS.jsxRuntime]: { js: KERNEL_JSX_RUNTIME },
    [KERNEL_PATHS.reactDom]: { js: KERNEL_REACT_DOM },
    [KERNEL_PATHS.reactDomServer]: { js: KERNEL_REACT_DOM_SERVER },
    [KERNEL_PATHS.drizzle]: { js: KERNEL_DRIZZLE },
    [KERNEL_PATHS.betterAuth]: { js: KERNEL_BETTER_AUTH },
    [KERNEL_PATHS.hono]: { js: KERNEL_HONO },
    [KERNEL_PATHS.zod]: { js: KERNEL_ZOD },
  };
}

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

type HostExports = {
  ScopedSql: (opts: { props: ScopedSqlProps }) => unknown;
};

export type ServeMode = "live" | "preview";

export async function serveSubApp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  appId: string,
  restPath: string,
  mode: ServeMode = "live"
): Promise<Response> {
  const stub = env.APP_DO.get(env.APP_DO.idFromName(appId));
  let version: VersionRecord | null = null;

  if (mode === "preview") {
    const latest = await stub.getLatest();
    version = latest.version;
  } else {
    const live = await stub.getLive();
    version = live.version;
  }

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

  if (version.kernelVersion !== KERNEL_VERSION) {
    return Response.json(
      {
        ok: false,
        error: "kernel_version_mismatch",
        appId,
        versionId: version.id,
        versionKernel: version.kernelVersion,
        hostKernel: KERNEL_VERSION,
      },
      { status: 409 }
    );
  }

  const url = new URL(request.url);
  const rest = restPath.replace(/^\/+/, "");
  const pathPrefix =
    mode === "preview"
      ? `/a/${encodeURIComponent(appId)}/preview`
      : `/a/${encodeURIComponent(appId)}`;
  const publicBase = `${url.origin}${pathPrefix}`;

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

  // --- API → LOADER dynamic worker ---
  if (rest === "api" || rest.startsWith("api/")) {
    const secret = env.BETTER_AUTH_SECRET;
    if (!secret) {
      return withVersionHeader(
        Response.json(
          { ok: false, error: "BETTER_AUTH_SECRET missing on host" },
          { status: 500 }
        )
      );
    }

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

    const res = await worker.getEntrypoint().fetch(new Request(innerUrl, init));
    return withVersionHeader(res);
  }

  // --- Static assets from version record ---
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
    return withVersionHeader(
      new Response(`not found: ${assetKey}`, { status: 404 })
    );
  }

  if (assetKey === "index.html") {
    const boot = `<script>window.__SFAB_PUBLIC_BASE__=${JSON.stringify(publicBase)};</script>`;
    if (body.includes("</head>")) {
      body = body.replace("</head>", `${boot}</head>`);
    } else {
      body = boot + body;
    }
  }

  return withVersionHeader(
    new Response(body, {
      status: 200,
      headers: {
        "content-type": contentType(assetKey),
        "cache-control":
          assetKey === "index.html" ? "no-store" : "public, max-age=60",
      },
    })
  );
}
