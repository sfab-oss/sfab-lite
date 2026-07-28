/**
 * Routing and HTTP primitives for the factory host worker.
 *
 * Owns the request-context types, the public route shape, and the shared
 * matchers / error helpers. Admin routing lives in `hono/`; handlers in
 * `admin.ts`.
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
 * An admin request whose organization has already been resolved by the
 * dispatcher. `organizationId` is always derived from the query param (or
 * the session); handlers never read it from a JSON body.
 */
export interface OrgCtx extends AdminCtx {
  organizationId: string;
}

/**
 * An admin request for one specific app, already checked to belong to the
 * actor. `appId` arrives decoded because the dispatcher had to decode it to
 * run that check — handlers no longer parse `match[1]` themselves.
 * `attemptId` is set on attempt-detail routes.
 */
export interface AppCtx extends AdminCtx {
  appId: string;
  attemptId?: string;
}

export interface PublicRoute {
  method: string | readonly string[];
  pattern: RegExp;
  handler: (rc: RouteCtx) => Promise<Response> | Response;
}

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

export const NOT_FOUND_BODY =
  "sfab-lite factory: /admin/health | /admin/apps | .../commit | .../check | .../revert | .../attempts\n";
