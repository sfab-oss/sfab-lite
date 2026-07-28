import { Hono } from "hono";
import {
  handleCheck,
  handleCommit,
  handleCreateApp,
  handleDeleteApp,
  handleGetApp,
  handleGetAttempt,
  handleGetLive,
  handleHealth,
  handleListApps,
  handleListAttempts,
  handleListVersions,
  handleRenameApp,
  handleRevert,
  handleSql,
  handleTouch,
} from "../admin.js";
import { NOT_FOUND_BODY } from "../routes.js";
import { adminCtx, appCtx, orgCtx } from "./context.js";
import { requireActor, requireApp, requireOrganization } from "./middleware.js";
import type { AdminEnv } from "./types.js";

/**
 * Factory `/admin` API. Mounted under `/admin` by `dispatchFactoryRequest`
 * (path prefix stripped before `fetch`). `AppType` drives the console's
 * typed `hc` client — `import type` only from the UI.
 *
 * Actor middleware runs before route match so unknown paths still 401 when
 * unauthenticated.
 *
 * `notFound` is attached after the chain so it does not erase typed routes
 * from `AppType`.
 */
const app = new Hono<AdminEnv>()
  .use("*", requireActor)
  .get("/health", (c) => handleHealth(adminCtx(c)))
  .get("/apps", requireOrganization, (c) => handleListApps(orgCtx(c)))
  .post("/apps", requireOrganization, (c) => handleCreateApp(orgCtx(c)))
  .get("/apps/:appId/touch", requireApp, (c) => handleTouch(appCtx(c)))
  .post("/apps/:appId/sql", requireApp, (c) => handleSql(appCtx(c)))
  .get("/apps/:appId/versions", requireApp, (c) =>
    handleListVersions(appCtx(c))
  )
  .get("/apps/:appId/live", requireApp, (c) => handleGetLive(appCtx(c)))
  .get("/apps/:appId/attempts/:attemptId", requireApp, (c) => {
    c.set("attemptId", decodeURIComponent(c.req.param("attemptId") ?? ""));
    return handleGetAttempt(appCtx(c));
  })
  .get("/apps/:appId/attempts", requireApp, (c) =>
    handleListAttempts(appCtx(c))
  )
  .post("/apps/:appId/check", requireApp, (c) => handleCheck(appCtx(c)))
  .post("/apps/:appId/commit", requireApp, (c) => handleCommit(appCtx(c)))
  .post("/apps/:appId/revert", requireApp, (c) => handleRevert(appCtx(c)))
  .get("/apps/:appId", requireApp, (c) => handleGetApp(appCtx(c)))
  .patch("/apps/:appId", requireApp, (c) => handleRenameApp(appCtx(c)))
  .delete("/apps/:appId", requireApp, (c) => handleDeleteApp(appCtx(c)));

app.notFound(() => new Response(NOT_FOUND_BODY, { status: 404 }));

export const adminApp = app;
export type AppType = typeof app;
