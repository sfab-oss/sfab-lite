/**
 * Routing and HTTP primitives for the factory host worker.
 *
 * Owns the request-context types, the public route shape, and the shared
 * matchers / error helpers. Protected routing lives in `hono/protected/`;
 * domain handlers in `lib/protected/`.
 */
import type { Actor } from "../hono/tenancy.js";

/** A request before any route has matched it. */
export interface RequestCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
}

/** …and after. `path` is the pathname; `groups` are regex captures (index 0 = first). */
export interface RouteCtx extends RequestCtx {
  path: string;
  groups: string[];
}

/** A request that cleared the `/api/protected` credential gate. */
export interface ProtectedCtx extends RouteCtx {
  actor: Actor;
}

/**
 * A protected request whose organization has already been resolved by the
 * dispatcher. `organizationId` is always derived from the query param (or
 * the session); handlers never read it from a JSON body.
 */
export interface OrgCtx extends ProtectedCtx {
  organizationId: string;
}

/**
 * A protected request for one specific app, already checked to belong to the
 * actor. `appId` arrives decoded because the dispatcher had to decode it to
 * run that check — handlers no longer parse `groups[0]` themselves.
 * `attemptId` is set on attempt-detail routes.
 */
export interface AppCtx extends ProtectedCtx {
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
): { route: R; groups: string[] } | null {
  for (const route of routes) {
    if (route.method !== "*" && !methodMatches(route.method, method)) {
      continue;
    }
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, groups: match.slice(1) };
    }
  }
  return null;
}

export const NOT_FOUND_BODY =
  "sfab-lite factory: /api/protected/health | /api/protected/apps | .../commit | .../check | .../revert | .../attempts\n";
