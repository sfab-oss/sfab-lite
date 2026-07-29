import { Hono } from "hono";
import { NOT_FOUND_BODY } from "../../routes.js";
import { requireActor } from "../middleware.js";
import type { AdminEnv } from "../types.js";
import appsRoutes from "./apps.js";
import healthRoutes from "./health.js";
import lifecycleRoutes from "./lifecycle.js";
import sqlRoutes from "./sql.js";
import versionsRoutes from "./versions.js";

/**
 * Credential-gated factory surface at `/api/protected`. Actor middleware
 * runs before route match so unknown paths still 401 when unauthenticated.
 *
 * `notFound` is attached after the chain so it does not erase typed routes
 * from `AppType`.
 *
 * Domain handlers live in `lib/protected/`; these route files validate, build
 * ctx, call lib, and `c.json` so `hc` infers JSON shapes.
 */
const protectedApp = new Hono<AdminEnv>()
  .use("*", requireActor)
  .route("/", healthRoutes)
  .route("/apps", appsRoutes)
  .route("/apps", sqlRoutes)
  .route("/apps", versionsRoutes)
  .route("/apps", lifecycleRoutes);

protectedApp.notFound(() => new Response(NOT_FOUND_BODY, { status: 404 }));

export { protectedApp };
