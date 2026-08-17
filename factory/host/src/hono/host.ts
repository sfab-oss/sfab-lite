import type { Context } from "hono";
import { Hono } from "hono";
import type { Db } from "../db/index.ts";
import type { ServeTarget } from "../registry/serve-target.ts";
import type { RequestCtx, RouteCtx } from "../serve/routes.ts";
import { serveKernel } from "../serve/serve-kernel.ts";
import { serveRegistryItem } from "../serve/serve-registry.ts";
import { routeCtx } from "./context.ts";
import type { Actor } from "./tenancy.ts";
import type { ApiEnv } from "./types.ts";

const RE_PREVIEW_PR = /^\d+$/;

/**
 * Distinguishes Hono's unmatched-route 404 from a handler that returned 404.
 * Never sent to the client — `dispatchFactoryRequest` turns it into `null`.
 */
const UNMATCHED_HEADER = "x-sfab-host-unmatched";

export interface HostDeps {
  dispatchMcp: (rc: RequestCtx) => Promise<Response> | Response;
  dispatchAgents: (rc: RequestCtx) => Promise<Response> | Response;
  dispatchInternal: (rc: RequestCtx) => Promise<Response> | Response;
  serveSubApp: (
    request: Request,
    env: Env,
    target: ServeTarget,
    restPath: string
  ) => Promise<Response>;
  createDb: (env: Env) => Db;
  resolveActor: (
    env: Env,
    db: Db,
    request: Request,
    origin: string
  ) => Promise<Actor | Response>;
  requireAppAccess: (
    db: Db,
    actor: Actor,
    appId: string
  ) => Promise<Response | null>;
  getWorkspaceAppId: (db: Db, workspaceId: string) => Promise<string | null>;
  handleAuthServerMetadata: (rc: RouteCtx) => Promise<Response> | Response;
}

function unmatchedResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: { [UNMATCHED_HEADER]: "1" },
  });
}

export function isHostUnmatched(res: Response): boolean {
  return res.headers.get(UNMATCHED_HEADER) === "1";
}

function ctxWithGroups(c: Context<ApiEnv>, groups: string[]): RouteCtx {
  return { ...routeCtx(c), groups };
}

function handleProtectedResourceMetadata(rc: RouteCtx): Response {
  return Response.json({
    resource: `${rc.url.origin}/mcp`,
    authorization_servers: [rc.url.origin],
    bearer_methods_supported: ["header"],
  });
}

async function handleKernel(rc: RouteCtx): Promise<Response> {
  const rest = rc.groups[0] ?? "";
  const res = await serveKernel(rc.request, rest, rc.env);
  return res ?? new Response("unknown kernel path\n", { status: 404 });
}

function handleRegistryItem(rc: RouteCtx): Response {
  return serveRegistryItem(rc.request, rc.groups[0] ?? "");
}

/**
 * HTML document nav to a gated preview/workspace: 302 to sign-in, except
 * unsigned iframe embeds which must stay 401 HTML (`target="_top"`) so the
 * factory chrome is not 302'd into the iframe.
 */
export function deniedDocumentAccess(
  request: Request,
  url: URL,
  unauthorized: Response
): Response {
  const accept = request.headers.get("Accept") ?? "";
  const htmlNav =
    (request.method === "GET" || request.method === "HEAD") &&
    accept.includes("text/html");
  if (!htmlNav) {
    return unauthorized;
  }
  const next = encodeURIComponent(`${url.pathname}${url.search}`);
  const signIn = new URL(`/signin?redirect=${next}`, url.origin);
  if (request.headers.get("Sec-Fetch-Dest") === "iframe") {
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Sign in required</title></head><body><p>Sign in required to view this preview.</p><p><a href="${signIn.href}" target="_top" rel="noopener">Open sign-in</a></p></body></html>`,
      {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8" },
      }
    );
  }
  return Response.redirect(signIn, 302);
}

async function requirePreviewAccess(
  rc: RouteCtx,
  appId: string,
  deps: HostDeps
): Promise<Response | null> {
  const db = deps.createDb(rc.env);
  const actor = await deps.resolveActor(rc.env, db, rc.request, rc.url.origin);
  if (actor instanceof Response) {
    return deniedDocumentAccess(rc.request, rc.url, actor);
  }
  return deps.requireAppAccess(db, actor, appId);
}

async function handlePreviewSubApp(
  rc: RouteCtx,
  appId: string,
  rest: string,
  deps: HostDeps
): Promise<Response> {
  const after = rest === "preview" ? "" : rest.slice("preview/".length);
  const slash = after.indexOf("/");
  const prToken = slash === -1 ? after : after.slice(0, slash);
  const prNumber = Number(prToken);
  if (
    !Number.isFinite(prNumber) ||
    prNumber < 1 ||
    !RE_PREVIEW_PR.test(prToken)
  ) {
    return Response.json(
      { ok: false, error: "preview_pr_required", appId },
      { status: 404 }
    );
  }
  const denied = await requirePreviewAccess(rc, appId, deps);
  if (denied) {
    return denied;
  }
  const inner = slash === -1 ? "" : after.slice(slash + 1);
  return deps.serveSubApp(
    rc.request,
    rc.env,
    { mode: "preview", appId, prNumber },
    inner
  );
}

async function handleSubApp(rc: RouteCtx, deps: HostDeps): Promise<Response> {
  const id = decodeURIComponent(rc.groups[0] ?? "");
  const rest = rc.groups[1] ?? "";
  if (rest === "workspace" || rest.startsWith("workspace/")) {
    if (!id.startsWith("ws_")) {
      return Response.json(
        { ok: false, error: "workspace_not_found", workspaceId: id },
        { status: 404 }
      );
    }
    const db = deps.createDb(rc.env);
    const appId = await deps.getWorkspaceAppId(db, id);
    if (!appId) {
      return Response.json(
        { ok: false, error: "workspace_not_found", workspaceId: id },
        { status: 404 }
      );
    }
    const denied = await requirePreviewAccess(rc, appId, deps);
    if (denied) {
      return denied;
    }
    const inner = rest === "workspace" ? "" : rest.slice("workspace/".length);
    return deps.serveSubApp(
      rc.request,
      rc.env,
      { mode: "workspace", workspaceId: id },
      inner
    );
  }
  if (rest === "preview" || rest.startsWith("preview/")) {
    return handlePreviewSubApp(rc, id, rest, deps);
  }
  return deps.serveSubApp(
    rc.request,
    rc.env,
    { mode: "live", appId: id },
    rest
  );
}

/**
 * Public / kernel / live / agents / exact-`/mcp` routes. Unmatched paths
 * return the sentinel that `isHostUnmatched` converts to `null` (Start).
 *
 * Do not use Hono `/mcp/*`, `/internal/*`, or `/agents/*` — those claim
 * `/mcp/consent`, bare `/internal`, and can look like prefix matches.
 * `/api` stays a segment-exact check in `dispatchFactoryRequest`.
 */
export function createHostApp(deps: HostDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get("/.well-known/oauth-authorization-server", (c) =>
    deps.handleAuthServerMetadata(routeCtx(c))
  );
  app.get("/.well-known/oauth-protected-resource", (c) =>
    handleProtectedResourceMetadata(routeCtx(c))
  );
  app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
    handleProtectedResourceMetadata(routeCtx(c))
  );

  app.get("/kernel/:rest{.+}", (c) =>
    handleKernel(ctxWithGroups(c, [c.req.param("rest") ?? ""]))
  );

  app.get("/r/:slug{.+\\.json}", (c) => {
    const slug = c.req.param("slug") ?? "";
    const name = slug.endsWith(".json") ? slug.slice(0, -".json".length) : slug;
    return handleRegistryItem(ctxWithGroups(c, [name]));
  });

  app.all("/a/:id", (c) =>
    handleSubApp(ctxWithGroups(c, [c.req.param("id") ?? "", ""]), deps)
  );
  app.all("/a/:id/:rest{.*}", (c) =>
    handleSubApp(
      ctxWithGroups(c, [c.req.param("id") ?? "", c.req.param("rest") ?? ""]),
      deps
    )
  );

  // startsWith("/internal/") — bare `/internal` is not claimed.
  app.all("/internal/:rest{.*}", (c) => deps.dispatchInternal(routeCtx(c)));

  app.all("/agents", (c) => deps.dispatchAgents(routeCtx(c)));
  app.all("/agents/:rest{.*}", (c) => deps.dispatchAgents(routeCtx(c)));

  // Exact `/mcp` only — `/mcp/consent` is a console screen and must reach Start.
  app.all("/mcp", (c) => deps.dispatchMcp(routeCtx(c)));

  app.notFound(() => unmatchedResponse());
  return app;
}
