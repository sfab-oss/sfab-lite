/**
 * @sfab-lite/factory — host worker entry.
 *
 * Commit is **asynchronous in transport, synchronous in semantics**: check is
 * still the gate, no version exists without a pass, and a version is live the
 * moment it exists. Only the waiting moved off the HTTP request, because a
 * commit costs 10–24s in production (measured).
 *
 * `POST .../commit` and `POST /api/protected/apps` return `202` with an
 * `attemptId`; poll `GET .../attempts/:attemptId`. Create also writes a D1
 * registry row (`creating` → `ready`|`failed`) so apps are enumerable. Revert
 * stays synchronous — it restores an already-checked version, so there is
 * nothing to wait for.
 *
 * Protected API: every `/api/protected/*` request needs a credential — a
 * matching `X-Admin-Token` (root: must pass `organizationId` as a query param
 * on organization-scoped routes; app-scoped routes need none) or a signed-in
 * session (scoped to its own organization). No credential is 401 whatever the
 * config says; a missing `ADMIN_TOKEN` no longer opens the surface. See
 * `tenancy.ts`. Domain handlers live in `lib/protected/`; Hono routing in
 * `hono/protected/`; commit orchestration in `commit.ts`; route primitives in
 * `routes.ts`.
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
  let rest = rc.match[2] ?? "";
  let mode: "live" | "preview" = "live";
  if (rest === "preview" || rest.startsWith("preview/")) {
    mode = "preview";
    rest = rest === "preview" ? "" : rest.slice("preview/".length);
  }
  return serveSubApp(rc.request, rc.env, rc.ctx, appId, rest, mode);
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
