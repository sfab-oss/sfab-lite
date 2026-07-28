/**
 * @sfab-lite/factory — host worker entry.
 *
 * Commit is **asynchronous in transport, synchronous in semantics**: check is
 * still the gate, no version exists without a pass, and a version is live the
 * moment it exists. Only the waiting moved off the HTTP request, because a
 * commit costs 10–24s in production (measured).
 *
 * `POST .../commit` and `POST /admin/apps` return `202` with an `attemptId`;
 * poll `GET .../attempts/:attemptId`. Create also writes a D1 registry row
 * (`creating` → `ready`|`failed`) so apps are enumerable. Revert stays
 * synchronous — it restores an already-checked version, so there is nothing
 * to wait for.
 *
 * Admin: every `/admin/*` request needs a credential — a matching
 * `X-Admin-Token` (root: must pass `organizationId` as a query param on
 * organization-scoped routes; app-scoped routes need none) or a signed-in
 * session (scoped to its own organization). No credential is 401 whatever the
 * config says; a missing `ADMIN_TOKEN` no longer opens the surface. See
 * `tenancy.ts`. Admin handlers and dispatch live in `admin.ts`; commit
 * orchestration in `commit.ts`; route primitives in `routes.ts`.
 */
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { dispatchAdmin } from "./admin.js";
import { dispatchAgents } from "./agent/dispatch.js";
import {
  createAuth,
  githubAuthEnabled,
  passwordAuthEnabled,
  signUpAvailable,
} from "./auth.js";
import { dispatchInternal } from "./internal.js";
import { handleMcpConsent, handleMcpConsentContext } from "./mcp/consent.js";
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
export { ScopedSql } from "./scoped-sql.js";

const RE_KERNEL = /^\/kernel\/(.+)$/;
const RE_SUBAPP = /^\/a\/([^/]+)(?:\/(.*))?$/;

/**
 * Public factory config for the sign-in UI. Unauthenticated on purpose: the
 * screen has to render before anyone is signed in, and both flags describe
 * the server's own configuration, not any user's data.
 *
 * The UI must be *told* which methods exist rather than probing, because the
 * two fail differently and neither signal generalises (both observed against
 * better-auth 1.6.19): disabled email/password stays mounted and returns
 * **400** at handler entry, while an unregistered GitHub provider is a real
 * **404 PROVIDER_NOT_FOUND**. Inferring "off" from either status would be
 * wrong about the other method. Do not re-read env client-side.
 *
 * `no-store` is precautionary, not a fix for an observed bug: nothing caches
 * this today (measured — no `cf-cache-status` on the response), and the
 * staleness we chased was secret propagation after `wrangler secret put`,
 * which no header affects. It is here because the console reads this once at
 * mount, so anything that ever did cache it would pin the wrong auth config
 * for the life of the page.
 */
function handleApiConfig(rc: RouteCtx): Response {
  return Response.json(
    {
      passwordAuth: passwordAuthEnabled(rc.env),
      githubAuth: githubAuthEnabled(rc.env),
      // Whether the sign-up form should render at all. Same reasoning as the two
      // above: closed sign-up does not 404, it fails at the end of a flow the
      // user already committed to, so the screen has to be told rather than probe.
      // Availability, not openness — an allowlisted factory renders the form and
      // rejects the addresses that are not on the list.
      signUpAvailable: signUpAvailable(rc.env),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function handleAuth(rc: RouteCtx): Promise<Response> | Response {
  const auth = createAuth(rc.env, rc.url.origin);
  return auth.handler(rc.request);
}

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

/** Everything reachable without a factory credential. */
const PUBLIC_ROUTES: PublicRoute[] = [
  { method: "GET", pattern: /^\/api\/config$/, handler: handleApiConfig },
  { method: "*", pattern: /^\/api\/auth(?:\/.*)?$/, handler: handleAuth },
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
  // The consent screen's own endpoints. Public in the routing sense only —
  // both establish the session themselves, and the POST also checks the
  // request's origin. See `mcp/consent.ts`.
  {
    method: "GET",
    pattern: /^\/api\/mcp\/consent$/,
    handler: handleMcpConsentContext,
  },
  {
    method: "POST",
    pattern: /^\/api\/mcp\/consent$/,
    handler: handleMcpConsent,
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

  const publicHit = matchRoute(PUBLIC_ROUTES, request.method, url.pathname);
  if (publicHit) {
    return await publicHit.route.handler({ ...rc, match: publicHit.match });
  }

  // Segment-exact: a bare `startsWith("/admin")` would also claim
  // `/administrator`, handing a console route to the admin dispatcher (401)
  // instead of the SPA.
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    return await dispatchAdmin(rc);
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
