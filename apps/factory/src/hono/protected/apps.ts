import { Hono } from "hono";
import {
  handleCreateApp,
  handleDeleteApp,
  handleGetApp,
  handleListApps,
  handleRenameApp,
  handleTouch,
} from "@/lib/protected/apps.js";
import {
  handleGetDefaultWorkspace,
  handleGetWorkspace,
  handleListWorkspaces,
} from "@/lib/protected/workspaces.js";
import { appCtx, orgCtx } from "../context.js";
import { requireApp, requireOrganization } from "../middleware.js";
import { createAppBodySchema, renameAppBodySchema } from "../schemas.js";
import type { AdminEnv } from "../types.js";
import { jsonBody } from "../validate.js";

const appsRoutes = new Hono<AdminEnv>()
  .get("/", requireOrganization, async (c) => {
    const r = await handleListApps(orgCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .post("/", requireOrganization, jsonBody(createAppBodySchema), async (c) => {
    const r = await handleCreateApp(orgCtx(c), c.req.valid("json"));
    if (r.status === 202) {
      return c.json(r.body, 202);
    }
    return c.json(r.body, r.status);
  })
  .get("/:appId/touch", requireApp, async (c) => {
    const r = await handleTouch(appCtx(c));
    return c.json(r.body, r.status);
  })
  .get("/:appId/workspaces", requireApp, async (c) => {
    const r = await handleListWorkspaces(appCtx(c));
    return c.json(r.body, r.status);
  })
  .get("/:appId/workspaces/default", requireApp, async (c) => {
    const r = await handleGetDefaultWorkspace(appCtx(c));
    return c.json(r.body, r.status);
  })
  .get("/:appId/workspaces/:workspaceId", requireApp, async (c) => {
    const workspaceId = decodeURIComponent(c.req.param("workspaceId") ?? "");
    const r = await handleGetWorkspace(appCtx(c), workspaceId);
    return c.json(r.body, r.status);
  })
  .get("/:appId", requireApp, async (c) => {
    const r = await handleGetApp(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .patch("/:appId", requireApp, jsonBody(renameAppBodySchema), async (c) => {
    const r = await handleRenameApp(appCtx(c), c.req.valid("json"));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  })
  .delete("/:appId", requireApp, async (c) => {
    const r = await handleDeleteApp(appCtx(c));
    if (r.status === 200) {
      return c.json(r.body, 200);
    }
    return c.json(r.body, r.status);
  });

export default appsRoutes;
