/**
 * Routing and HTTP primitives for the factory host worker.
 *
 * Owns the request-context types, the public/admin route shapes, and the
 * shared matchers / error helpers. Handlers and dispatch live elsewhere.
 */
import type { Actor } from "./tenancy.js";

/** A request before any route has matched it. */
export interface RequestCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
}

/** …and after. `match` exists only once a pattern produced it. */
export interface RouteCtx extends RequestCtx {
  match: RegExpMatchArray;
}

/** A request that cleared the `/admin` credential gate. */
export interface AdminCtx extends RouteCtx {
  actor: Actor;
}

/**
 * An admin request for one specific app, already checked to belong to the
 * actor. `appId` arrives decoded because the dispatcher had to decode it to
 * run that check — handlers no longer parse `match[1]` themselves.
 */
export interface AppCtx extends AdminCtx {
  appId: string;
}

export interface PublicRoute {
  method: string | readonly string[];
  pattern: RegExp;
  handler: (rc: RouteCtx) => Promise<Response> | Response;
}

/**
 * Admin routes declare their scope, and the scope *is* the authorization.
 *
 * `"app"` routes take an app id in `match[1]`; the dispatcher runs
 * `requireAppAccess` and hands the handler an `AppCtx`. A new app-scoped route
 * cannot silently skip the ownership check, because the only way to receive an
 * `appId` is to ask for the scope that checks it.
 */
export type AdminRoute = {
  method: string | readonly string[];
  pattern: RegExp;
} & (
  | {
      scope: "factory";
      handler: (rc: AdminCtx) => Promise<Response> | Response;
    }
  | { scope: "app"; handler: (rc: AppCtx) => Promise<Response> | Response }
);

function methodMatches(
  allowed: string | readonly string[],
  method: string
): boolean {
  if (typeof allowed === "string") {
    return allowed === method;
  }
  return allowed.includes(method);
}

export function matchRoute<
  R extends { method: string | readonly string[]; pattern: RegExp },
>(
  routes: R[],
  method: string,
  pathname: string
): { route: R; match: RegExpMatchArray } | null {
  for (const route of routes) {
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

export function jsonError(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export const NOT_FOUND_BODY =
  "sfab-lite factory: /admin/health | /admin/apps | .../commit | .../check | .../revert | .../attempts\n";
