import { Hono } from "hono";
import type { AppEnv } from "./middleware";
import { withAuth } from "./middleware";
import { devRoutes } from "./routes/dev";
import { documentRoutes } from "./routes/documents";
import { entityRoutes } from "./routes/entities";
import { productRoutes } from "./routes/products";
import { sessionRoutes } from "./routes/session";

/**
 * The app's API. `app` is the contract with the factory: it compiles this
 * export into the worker that serves your app, so keep the name.
 *
 * `AppType` is the other half — the SPA's typed client (`ui/lib/api.ts`) is
 * inferred from it, so a route signature change shows up in the UI as a type
 * error rather than at runtime.
 */
export const app = new Hono<AppEnv>()
  .use("/api/*", withAuth)
  .get("/api/health", (c) => c.json({ ok: true, service: "sfab-lite-app" }))
  .all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw))
  .route("/api/session-context", sessionRoutes)
  .route("/api/dev", devRoutes)
  .route("/api/entities", entityRoutes)
  .route("/api/products", productRoutes)
  .route("/api/documents", documentRoutes);

export type AppType = typeof app;
