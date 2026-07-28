import { createMiddleware } from "hono/factory";
import { createDb } from "../db/index.js";
import {
  requireAppAccess,
  resolveActor,
  resolveOrganization,
} from "../tenancy.js";
import type { AdminEnv } from "./types.js";

/**
 * Credential first on every `/admin/*` path — including unknowns — so an
 * anonymous probe gets 401 rather than a route map via 404.
 */
export const requireActor = createMiddleware<AdminEnv>(async (c, next) => {
  const db = createDb(c.env);
  const actor = await resolveActor(
    c.env,
    db,
    c.req.raw,
    new URL(c.req.url).origin
  );
  if (actor instanceof Response) {
    return actor;
  }
  c.set("db", db);
  c.set("actor", actor);
  await next();
});

export const requireOrganization = createMiddleware<AdminEnv>(
  async (c, next) => {
    const scope = resolveOrganization(
      c.get("actor"),
      c.req.query("organizationId")
    );
    if (scope instanceof Response) {
      return scope;
    }
    c.set("organizationId", scope.organizationId);
    await next();
  }
);

export const requireApp = createMiddleware<AdminEnv>(async (c, next) => {
  const appId = decodeURIComponent(c.req.param("appId") ?? "");
  const denied = await requireAppAccess(c.get("db"), c.get("actor"), appId);
  if (denied) {
    return denied;
  }
  c.set("appId", appId);
  await next();
});
