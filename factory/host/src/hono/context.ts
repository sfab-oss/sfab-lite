import type { Context } from "hono";
import type {
  AppCtx,
  OrgCtx,
  ProtectedCtx,
  RouteCtx,
} from "../serve/routes.js";
import type { AdminEnv, ApiEnv } from "./types.js";

export function routeCtx<E extends ApiEnv>(c: Context<E>): RouteCtx {
  const url = new URL(c.req.url);
  return {
    request: c.req.raw,
    env: c.env,
    ctx: c.executionCtx as ExecutionContext,
    url,
    path: url.pathname,
    groups: [],
  };
}

function baseCtx(c: Context<AdminEnv>): Omit<ProtectedCtx, "actor"> & {
  actor: ProtectedCtx["actor"];
} {
  return {
    ...routeCtx(c),
    actor: c.get("actor"),
  };
}

export function protectedCtx(c: Context<AdminEnv>): ProtectedCtx {
  return baseCtx(c);
}

export function orgCtx(c: Context<AdminEnv>): OrgCtx {
  const organizationId = c.get("organizationId");
  if (!organizationId) {
    throw new Error("organizationId missing after requireOrganization");
  }
  return {
    ...baseCtx(c),
    organizationId,
  };
}

export function appCtx(c: Context<AdminEnv>): AppCtx {
  const appId = c.get("appId");
  if (!appId) {
    throw new Error("appId missing after requireApp");
  }
  return {
    ...baseCtx(c),
    appId,
    attemptId: c.get("attemptId"),
  };
}
