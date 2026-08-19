import { Hono } from "hono";
import { devRoutes } from "./hono/dev";
import { withAuth } from "./hono/middleware/auth";
import { appErrorHandler } from "./hono/middleware/error-handler";
import { protectedRoutes } from "./hono/protected";
import { publicRoutes } from "./hono/public";
import type { AppEnv } from "./hono/types";

/**
 * Inner API tree (no `/api` prefix). Typed client uses
 * `hc<ApiType>(publicBase ? `${publicBase}/api` : "/api")` so calls look like
 * `client.protected.parties.$get()` while HTTP paths stay `/api/...`.
 *
 * Org-scoped resources mount under `/protected` (after session-context),
 * matching starter ergonomics without a hyphenated `org-protected` client key.
 * Seed stays at `/dev` (token-gated, no org).
 */
const api = new Hono<AppEnv>()
  .use("*", withAuth)
  .route("/", publicRoutes)
  .route("/protected", protectedRoutes)
  .route("/dev", devRoutes);

/**
 * The app's API. `app` is the contract with the factory: it compiles this
 * export into the worker that serves your app, so keep the name.
 *
 * `ApiType` (not `AppType`) is the inner `/api` tree the emit unit prints
 * into `src/generated/api.d.ts`. The SPA client imports that snapshot, not
 * `typeof` this module.
 */
export const app = new Hono<AppEnv>()
  .onError(appErrorHandler)
  .route("/api", api);

export type ApiType = typeof api;
