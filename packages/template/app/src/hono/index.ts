import { Hono } from "hono";
import { withAuth } from "./middleware/auth";
import { appErrorHandler } from "./middleware/error-handler";
import { devRoutes } from "./org-protected/dev";
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
 * `ApiType` (not `AppType`) is what the SPA client is inferred from — the
 * tree under `/api`, so the client is not stuck with an awkward `.api.` hop.
 */
export const app = new Hono<AppEnv>()
  .onError(appErrorHandler)
  .route("/api", api);

export type ApiType = typeof api;
