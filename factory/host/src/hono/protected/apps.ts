import { Hono } from "hono";
import { handleAddRecipe } from "@/lib/protected/add.js";
import {
  handleCreateApp,
  handleDeleteApp,
  handleGetApp,
  handleListApps,
  handleRenameApp,
  handleTouch,
} from "@/lib/protected/apps.js";
import {
  handleCreateWorkspace,
  handleDeleteWorkspace,
  handleGetDefaultWorkspace,
  handleGetWorkspace,
  handleListWorkspaces,
  handleRenameWorkspace,
  handleSetDefaultWorkspace,
} from "@/lib/protected/workspaces.js";
import { appCtx, orgCtx } from "../context.js";
import { requireApp, requireOrganization } from "../middleware.js";
import {
  addRecipeBodySchema,
  createAppBodySchema,
  createWorkspaceBodySchema,
  renameAppBodySchema,
  renameWorkspaceBodySchema,
} from "../schemas.js";
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
  .post("/:appId/add", requireApp, jsonBody(addRecipeBodySchema), async (c) => {
    const r = await handleAddRecipe(appCtx(c), c.req.valid("json"));
    return c.json(r.body, r.status);
  })
  .get("/:appId/workspaces", requireApp, async (c) => {
    const r = await handleListWorkspaces(appCtx(c));
    return c.json(r.body, r.status);
  })
  .post(
    "/:appId/workspaces",
    requireApp,
    jsonBody(createWorkspaceBodySchema),
    async (c) => {
      const r = await handleCreateWorkspace(appCtx(c), c.req.valid("json"));
      return c.json(r.body, r.status);
    }
  )
  .get("/:appId/workspaces/default", requireApp, async (c) => {
    const r = await handleGetDefaultWorkspace(appCtx(c));
    return c.json(r.body, r.status);
  })
  .get("/:appId/workspaces/:workspaceId", requireApp, async (c) => {
    const workspaceId = decodeURIComponent(c.req.param("workspaceId") ?? "");
    const r = await handleGetWorkspace(appCtx(c), workspaceId);
    return c.json(r.body, r.status);
  })
  .patch(
    "/:appId/workspaces/:workspaceId",
    requireApp,
    jsonBody(renameWorkspaceBodySchema),
    async (c) => {
      const workspaceId = decodeURIComponent(c.req.param("workspaceId") ?? "");
      const r = await handleRenameWorkspace(
        appCtx(c),
        workspaceId,
        c.req.valid("json")
      );
      return c.json(r.body, r.status);
    }
  )
  .post("/:appId/workspaces/:workspaceId/default", requireApp, async (c) => {
    const workspaceId = decodeURIComponent(c.req.param("workspaceId") ?? "");
    const r = await handleSetDefaultWorkspace(appCtx(c), workspaceId);
    return c.json(r.body, r.status);
  })
  .delete("/:appId/workspaces/:workspaceId", requireApp, async (c) => {
    const workspaceId = decodeURIComponent(c.req.param("workspaceId") ?? "");
    const r = await handleDeleteWorkspace(appCtx(c), workspaceId);
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
