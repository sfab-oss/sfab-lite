import type { Context } from "hono";
import type { AppCtx, OrgCtx, ProtectedCtx } from "../server/routes.js";
import type { AdminEnv } from "./types.js";

function dummyMatch(path: string, ...groups: string[]): RegExpMatchArray {
  const match = [path, ...groups] as unknown as RegExpMatchArray;
  match.index = 0;
  match.input = path;
  return match;
}

function baseCtx(c: Context<AdminEnv>): Omit<ProtectedCtx, "actor"> & {
  actor: ProtectedCtx["actor"];
} {
  const url = new URL(c.req.url);
  return {
    request: c.req.raw,
    env: c.env,
    ctx: c.executionCtx as ExecutionContext,
    url,
    match: dummyMatch(url.pathname),
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
