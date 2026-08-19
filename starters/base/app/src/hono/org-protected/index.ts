import { Hono } from "hono";
import { requireOrg } from "../middleware/auth";
import type { AppEnv } from "../types";

/**
 * Org-scoped mount. Starts empty — agents `.route()` resources onto this.
 */
export const orgProtectedRoutes = new Hono<AppEnv>().use("*", requireOrg);
