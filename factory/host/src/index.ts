/**
 * @sfab-lite/factory — host worker entry.
 *
 * Create returns `202` with a create-job id; poll `GET .../attempts/:id`.
 * Shipping code is PR merge onto `main` (CD writes an immutable build and sets
 * D1 `live_sha`). Protected API credentials: `X-Admin-Token` or session.
 * See `hono/tenancy.ts`. Domain handlers in `lib/protected/`; Hono in
 * `hono/protected/` and `hono/host.ts`; CD in `forge/cd.ts`; code host in
 * `code-host/`.
 */
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { dispatchAgents } from "./agent/dispatch.js";
import { createAuth } from "./auth/server.js";
import { createDb } from "./db/index.js";
import { dispatchInternal } from "./forge/internal.js";
import { createHostApp, isHostUnmatched } from "./hono/host.js";
import { apiApp } from "./hono/index.js";
import { requireAppAccess, resolveActor } from "./hono/tenancy.js";
import { dispatchMcp } from "./mcp/index.js";
import { getWorkspaceAppId } from "./registry/workspace-registry.js";
import type { RouteCtx } from "./serve/routes.js";
import { serveSubApp } from "./serve/serve.js";

/** Facet class for Think's execute / code-mode runtime (`ctx.exports`). */
export { CodemodeRuntime } from "@cloudflare/codemode";
export { AppAgent } from "./agent/app-agent.js";
/** Facet of AppAgent — exported so the runtime can construct it; no binding. */
export { AppThread } from "./agent/app-thread.js";
export { AppCreateDO } from "./durable-objects/app-create-do.js";
export { AppDataDO } from "./durable-objects/app-data-do.js";
export { OrgEvents } from "./durable-objects/org-events-do.js";

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

const hostApp = createHostApp({
  dispatchMcp,
  dispatchAgents,
  dispatchInternal,
  serveSubApp,
  createDb,
  resolveActor,
  requireAppAccess,
  getWorkspaceAppId,
  handleAuthServerMetadata,
});

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

  // Segment-exact: a bare `startsWith("/api")` would also claim `/apiculture`.
  // Hono `apiApp` mounts at `/api` so `c.req.raw` keeps full paths for auth.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return await apiApp.fetch(request, env, ctx);
  }

  const res = await hostApp.fetch(request, env, ctx);
  if (isHostUnmatched(res)) {
    return null;
  }
  return res;
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
