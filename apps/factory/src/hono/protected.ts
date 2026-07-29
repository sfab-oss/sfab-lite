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
} from "../protected-handlers.js";
import { NOT_FOUND_BODY } from "../routes.js";
import { protectedCtx, appCtx, orgCtx } from "./context.js";
import { requireActor, requireApp, requireOrganization } from "./middleware.js";
import {
  checkBodySchema,
  commitBodySchema,
  createAppBodySchema,
  renameAppBodySchema,
  revertBodySchema,
  sqlBodySchema,
} from "./schemas.js";
import type { AdminEnv } from "./types.js";
import { jsonBody } from "./validate.js";

/**
 * Credential-gated factory surface at `/api/protected`. Actor middleware
 * runs before route match so unknown paths still 401 when unauthenticated.
 *
 * `notFound` is attached after the chain so it does not erase typed routes
 * from `AppType`.
 *
 * Each handler returns `{ status, body }`; routes call `c.json` so `hc`
 * infers JSON shapes. Branch on status where success/error bodies differ.
 */
const protectedApp = new Hono<AdminEnv>()
  .use("*", requireActor)
  .get("/health", async (c) => {
    const r = await handleHealth(protectedCtx(c));
    return c.json(r.body, r.status);
  })
  .get("/apps", requireOrganization, async (c) => {
    const r = await handleListApps(orgCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .post(
    "/apps",
    requireOrganization,
    jsonBody(createAppBodySchema),
    async (c) => {
      const r = await handleCreateApp(orgCtx(c), c.req.valid("json"));
      if (r.status === 202) {
        return c.json(r.body, 202);
      }
      return c.json(r.body, r.status);
    }
  )
  .get("/apps/:appId/touch", requireApp, async (c) => {
    const r = await handleTouch(appCtx(c));
    return c.json(r.body, r.status);
  })
  .post("/apps/:appId/sql", requireApp, jsonBody(sqlBodySchema), async (c) => {
    const r = await handleSql(appCtx(c), c.req.valid("json"));
    return c.json(r.body, r.status);
  })
  .get("/apps/:appId/versions", requireApp, async (c) => {
    const r = await handleListVersions(appCtx(c));
    return c.json(r.body, 200);
  })
  .get("/apps/:appId/live", requireApp, async (c) => {
    const r = await handleGetLive(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/apps/:appId/attempts/:attemptId", requireApp, async (c) => {
    c.set("attemptId", decodeURIComponent(c.req.param("attemptId") ?? ""));
    const r = await handleGetAttempt(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .get("/apps/:appId/attempts", requireApp, async (c) => {
    const r = await handleListAttempts(appCtx(c));
    return c.json(r.body, r.status);
  })
  .post(
    "/apps/:appId/check",
    requireApp,
    jsonBody(checkBodySchema),
    async (c) => {
      const r = await handleCheck(appCtx(c), c.req.valid("json"));
      if (r.status === 200) {
        return c.json(r.body, 200);
      }
      return c.json(r.body, r.status);
    }
  )
  .post(
    "/apps/:appId/commit",
    requireApp,
    jsonBody(commitBodySchema),
    async (c) => {
      const r = await handleCommit(appCtx(c), c.req.valid("json"));
      if (r.status === 202) {
        return c.json(r.body, 202);
      }
      return c.json(r.body, r.status);
    }
  )
  .post(
    "/apps/:appId/revert",
    requireApp,
    jsonBody(revertBodySchema),
    async (c) => {
      const r = await handleRevert(appCtx(c), c.req.valid("json"));
      if (r.status === 200) {
        return c.json(r.body, 200);
      }
      return c.json(r.body, r.status);
    }
  )
  .get("/apps/:appId", requireApp, async (c) => {
    const r = await handleGetApp(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .patch(
    "/apps/:appId",
    requireApp,
    jsonBody(renameAppBodySchema),
    async (c) => {
      const r = await handleRenameApp(appCtx(c), c.req.valid("json"));
      if (r.status === 200) {
        return c.json(r.body, 200);
      }
      return c.json(r.body, r.status);
    }
  )
  .delete("/apps/:appId", requireApp, async (c) => {
    const r = await handleDeleteApp(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  });

protectedApp.notFound(() => new Response(NOT_FOUND_BODY, { status: 404 }));

export { protectedApp };
