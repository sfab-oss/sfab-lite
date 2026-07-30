import { createDb } from "../../db/index.js";
import { protectedError } from "../../hono/reply.js";
import { wireWorkspace } from "../../hono/wire.js";
import {
  getDefaultWorkspaceForApp,
  getWorkspaceUnscoped,
  listWorkspacesForApp,
  workspaceBelongsToApp,
} from "../../registry/workspace-registry.js";
import type { AppCtx } from "../../serve/routes.js";

export async function handleListWorkspaces(rc: AppCtx) {
  const workspaces = await listWorkspacesForApp(createDb(rc.env), rc.appId);
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      workspaces: workspaces.map(wireWorkspace),
    },
  };
}

export async function handleGetDefaultWorkspace(rc: AppCtx) {
  const workspace = await getDefaultWorkspaceForApp(createDb(rc.env), rc.appId);
  if (!workspace) {
    return protectedError("workspace_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, workspace: wireWorkspace(workspace) },
  };
}

export async function handleGetWorkspace(rc: AppCtx, workspaceId: string) {
  const db = createDb(rc.env);
  const belongs = await workspaceBelongsToApp(db, rc.appId, workspaceId);
  if (!belongs) {
    return protectedError("workspace_not_found", 404);
  }
  const workspace = await getWorkspaceUnscoped(db, workspaceId);
  if (!workspace) {
    return protectedError("workspace_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, workspace: wireWorkspace(workspace) },
  };
}
