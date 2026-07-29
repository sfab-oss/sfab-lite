/**
 * @sfab-lite/factory — host worker entry.
 *
 * Create returns `202` with a create-job id; poll `GET .../attempts/:id`.
 * Shipping code is PR merge onto `main` (CD writes an immutable build and sets
 * D1 `live_sha`). Protected API credentials: `X-Admin-Token` or session.
 * See `tenancy.ts`. Domain handlers in `lib/protected/`; Hono in
 * `hono/protected/`; CD in `cd.ts`; code host in `r2-code-host.ts`.
 */
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { dispatchAgents } from "./agent/dispatch.js";
import { createAuth } from "./auth.js";
import { apiApp } from "./hono/index.js";
import { dispatchInternal } from "./internal.js";
import { dispatchMcp } from "./mcp/index.js";
import type { PublicRoute, RequestCtx, RouteCtx } from "./routes.js";
import { matchRoute } from "./routes.js";
import { serveSubApp } from "./serve.js";
import { serveKernel } from "./serve-kernel.js";

/** Facet class for Think's execute / code-mode runtime (`ctx.exports`). */
export { CodemodeRuntime } from "@cloudflare/codemode";
export { AppAgent } from "./agent/app-agent.js";
/** Facet of AppAgent — exported so the runtime can construct it; no binding. */
export { AppThread } from "./agent/app-thread.js";
export { AppDO } from "./app-do.js";
export { OrgEvents } from "./org-events-do.js";
export { ScopedSql } from "./scoped-sql.js";

const RE_KERNEL = /^\/kernel\/(.+)$/;
const RE_SUBAPP = /^\/a\/([^/]+)(?:\/(.*))?$/;
const RE_PREVIEW_PR = /^\d+$/;

/**
 * Where an MCP client looks to discover that this factory *is* an
 * authorization server — at the origin root, not under `basePath`, because
 * that is where the spec tells clients to look. Derived from the oauthProvider
 * plugin's own config so the advertised endpoints cannot drift from the ones
 * that exist.
 */
function handleAuthServerMetadata(rc: RouteCtx): Promise<Response> | Response {
  const auth = createAuth(rc.env, rc.url.origin);
  return oauthProviderAuthServerMetadata(auth)(rc.request);
}

/**
 * RFC 9728 protected-resource metadata. Served at the bare path and at the
 * `/mcp` suffix because that is what the `WWW-Authenticate` challenge on a 401
 * points at, and a client following it must not 404.
 */
function handleProtectedResourceMetadata(rc: RouteCtx): Response {
  return Response.json({
    resource: `${rc.url.origin}/mcp`,
    authorization_servers: [rc.url.origin],
    bearer_methods_supported: ["header"],
  });
}

async function handleKernel(rc: RouteCtx): Promise<Response> {
  const rest = rc.match[1] ?? "";
  const res = await serveKernel(rc.request, rest, rc.env);
  return res ?? new Response("unknown kernel path\n", { status: 404 });
}

function handleSubApp(rc: RouteCtx): Promise<Response> {
  const appId = decodeURIComponent(rc.match[1] ?? "");
  const rest = rc.match[2] ?? "";
  if (rest === "preview" || rest.startsWith("preview/")) {
    const after = rest === "preview" ? "" : rest.slice("preview/".length);
    const slash = after.indexOf("/");
    const prToken = slash === -1 ? after : after.slice(0, slash);
    const prNumber = Number(prToken);
    if (
      !Number.isFinite(prNumber) ||
      prNumber < 1 ||
      !RE_PREVIEW_PR.test(prToken)
    ) {
      return Promise.resolve(
        Response.json(
          { ok: false, error: "preview_pr_required", appId },
          { status: 404 }
        )
      );
    }
    const inner = slash === -1 ? "" : after.slice(slash + 1);
    return serveSubApp(rc.request, rc.env, rc.ctx, appId, inner, "preview", {
      prNumber,
    });
  }
  return serveSubApp(rc.request, rc.env, rc.ctx, appId, rest, "live");
}

/**
 * Everything reachable without a factory credential — except `/api/*`, which
 * is the Hono tree (`auth`, public config/consent, `protected`).
 */
const PUBLIC_ROUTES: PublicRoute[] = [
  // OAuth discovery. Public by definition — a client reads these *before* it
  // has any credential, which is the whole point of them.
  {
    method: ["GET", "HEAD"],
    pattern: /^\/\.well-known\/oauth-authorization-server$/,
    handler: handleAuthServerMetadata,
  },
  {
    method: ["GET", "HEAD"],
    pattern: /^\/\.well-known\/oauth-protected-resource(?:\/mcp)?$/,
    handler: handleProtectedResourceMetadata,
  },
  { method: ["GET", "HEAD"], pattern: RE_KERNEL, handler: handleKernel },
  // A generated app served to its own end users — see `tenancy.ts` on why
  // this one is addressed by app id alone.
  { method: "*", pattern: RE_SUBAPP, handler: handleSubApp },
];

/**
 * Host API / agent / sub-app / MCP dispatch. Returns `null` for document
 * routes that TanStack Start should render (console SPA).
 */
export async function dispatchFactoryRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response | null> {
  const url = new URL(request.url);
  const rc: RequestCtx = { request, env, ctx, url };

  // Segment-exact: a bare `startsWith("/api")` would also claim `/apiculture`.
  // Hono `apiApp` mounts at `/api` so `c.req.raw` keeps full paths for auth.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return await apiApp.fetch(request, env, ctx);
  }

  const publicHit = matchRoute(PUBLIC_ROUTES, request.method, url.pathname);
  if (publicHit) {
    return await publicHit.route.handler({ ...rc, match: publicHit.match });
  }

  // Loopback only — the AppDO's alarm calling back in to run a create where
  // D1 lives. Authenticated by a derived capability token, never a session:
  // a Durable Object has none. See `internal.ts`.
  if (url.pathname.startsWith("/internal/")) {
    return await dispatchInternal(rc);
  }

  // Think / agents — auth + app tenancy + namespace allowlist before any DO
  // lookup. See `agent/dispatch.ts`.
  if (url.pathname === "/agents" || url.pathname.startsWith("/agents/")) {
    return await dispatchAgents(rc);
  }

  // The factory's own tools, without a model driving them. Exactly `/mcp` —
  // `/mcp/consent` is a console screen and must reach Start below. See `mcp/`.
  if (url.pathname === "/mcp") {
    return await dispatchMcp(rc);
  }

  return null;
}

/** @deprecated Prefer `src/server.ts` (TanStack Start + CF Vite entry). */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const hit = await dispatchFactoryRequest(request, env, ctx);
    if (hit) {
      return hit;
    }
    return new Response("console entry is src/server.ts\n", { status: 500 });
  },
};
