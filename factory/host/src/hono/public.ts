import type { Context } from "hono";
import { Hono } from "hono";
import {
  githubAuthEnabled,
  passwordAuthEnabled,
  signUpAvailable,
} from "@/lib/auth/policy";
import { createAuth } from "../auth/server.js";
import { handleMcpConsent, handleMcpConsentContext } from "../mcp/consent.js";
import type { RouteCtx } from "../serve/routes.js";
import type { ApiEnv } from "./types.js";

function routeCtx(c: Context<ApiEnv>): RouteCtx {
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

/**
 * Unauthenticated factory config and MCP consent — formerly RegExp
 * `PUBLIC_ROUTES` under `/api`. Paths are relative to the `/api` mount.
 */
export const publicRoutes = new Hono<ApiEnv>()
  .get("/config", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({
      passwordAuth: passwordAuthEnabled(c.env),
      githubAuth: githubAuthEnabled(c.env),
      signUpAvailable: signUpAvailable(c.env),
    });
  })
  .get("/mcp/consent", (c) => handleMcpConsentContext(routeCtx(c)))
  .post("/mcp/consent", (c) => handleMcpConsent(routeCtx(c)));

/** better-auth handler; `c.req.raw` keeps `/api/auth/*` for `basePath`. */
export function handleAuthRoute(c: Context<ApiEnv>) {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  return auth.handler(c.req.raw);
}
