import { Hono } from "hono";
import { protectedApp } from "./protected.js";
import { handleAuthRoute, publicRoutes } from "./public.js";
import type { ApiEnv } from "./types.js";

/**
 * Factory HTTP API — paths relative to `/api`. Mounted by
 * `dispatchFactoryRequest` via `apiApp` so `c.req.raw` keeps full `/api/...`
 * URLs for better-auth's `basePath: "/api/auth"`.
 *
 * `AppType` drives the console's typed `hc` client — `import type` only from
 * the UI (`hc<AppType>("/api")` → `client.protected.apps…`).
 */
const app = new Hono<ApiEnv>()
  .all("/auth/*", handleAuthRoute)
  .route("/", publicRoutes)
  .route("/protected", protectedApp);

/** Full-path mount for the host dispatcher (`/api` + `app`). */
export const apiApp = new Hono<ApiEnv>().route("/api", app);

export type AppType = typeof app;
