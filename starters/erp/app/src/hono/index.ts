import { Hono } from "hono";
import { devRoutes } from "./dev";
import { withAuth } from "./middleware/auth";
import { appErrorHandler } from "./middleware/error-handler";
import { protectedRoutes } from "./protected";
import { publicRoutes } from "./public";
import type { AppEnv } from "./types";

/**
 * Inner API tree (no `/api` prefix). Typed client uses
 * `hc<ApiType>(publicBase ? `${publicBase}/api` : "/api")` so calls look like
 * `client.protected.entities.$get()` while HTTP paths stay `/api/...`.
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
