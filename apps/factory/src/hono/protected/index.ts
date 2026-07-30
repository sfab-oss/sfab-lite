import { Hono } from "hono";
import { NOT_FOUND_BODY } from "../../serve/routes.js";
import { requireActor } from "../middleware.js";
import type { AdminEnv } from "../types.js";
import appsRoutes from "./apps.js";
import forgeRoutes from "./forge.js";
import healthRoutes from "./health.js";
import lifecycleRoutes from "./lifecycle.js";
import liveRoutes from "./live.js";
import orgEventsRoutes from "./org-events.js";
import sqlRoutes from "./sql.js";

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
  .route("/apps", liveRoutes)
  .route("/apps", lifecycleRoutes)
  .route("/apps", forgeRoutes)
  .route("/org-events", orgEventsRoutes);

protectedApp.notFound(() => new Response(NOT_FOUND_BODY, { status: 404 }));

export { protectedApp };
