import { createMiddleware } from "hono/factory";
import { createAuth, resolveBaseUrl } from "../../auth";
import { createDb } from "../../db";
import type { AppEnv } from "../types";

/**
 * Builds the per-request auth client and db handle once, instead of every
 * route rebuilding both. Cheap: neither opens a connection here.
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  c.set("auth", createAuth(c.env, resolveBaseUrl(c.env, c.req.raw)));
  c.set("db", createDb(c.env));
  await next();
});

/**
 * The app's data is scoped per organization, so every data route needs a
 * session *and* an active organization. One guard, one place to change it.
 */
export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.get("auth").api.getSession({
    headers: c.req.raw.headers,
  });
  const orgId = session?.session.activeOrganizationId;

  if (!(session && orgId)) {
    return c.json({ error: "unauthorized" as const }, 401);
  }

  c.set("orgId", orgId);
  await next();
});
