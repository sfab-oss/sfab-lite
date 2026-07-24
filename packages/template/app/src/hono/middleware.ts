import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth";
import { createAuth, resolveBaseUrl } from "../auth";
import type { Db } from "../db";
import { createDb } from "../db";
import type { Env } from "../env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    auth: Auth;
    db: Db;
    /** Set by `requireOrg`; only read on routes mounted behind it. */
    orgId: string;
  };
}

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
