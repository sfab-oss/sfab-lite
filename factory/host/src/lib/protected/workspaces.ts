import { getAgentByName } from "agents";
import { createDb } from "../../db/index.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type {
  CreateWorkspaceBody,
  RenameWorkspaceBody,
} from "../../hono/schemas.js";
import { wireWorkspace } from "../../hono/wire.js";
import { wsDataId } from "../../registry/app-data-ids.js";
import { appDataStub } from "../../registry/app-stub.js";
import { deleteWorkspaceBuild } from "../../registry/workspace-build.js";
import {
  countWorkspacesForApp,
  createWorkspaceForApp,
  deleteWorkspaceForApp,
  getDefaultWorkspaceForApp,
  getWorkspaceUnscoped,
  listWorkspacesForApp,
  renameWorkspaceForApp,
  setDefaultWorkspaceForApp,
  WORKSPACE_NAME_MAX_LENGTH,
  workspaceBelongsToApp,
} from "../../registry/workspace-registry.js";
import {
  deleteStoragePrefix,
  storageWorkspacePrefix,
} from "../../serve/app-storage.js";
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

/**
 * Create a non-default workspace and touch its AppAgent so `onStart` schedules
 * the code-host seed (same getAgentByName path MCP uses).
 */
export async function handleCreateWorkspace(
  rc: AppCtx,
  body: CreateWorkspaceBody
): Promise<ProtectedReply<unknown>> {
  const name = body.name.trim();
  if (!name) {
    return protectedError("name_required");
  }
  if (name.length > WORKSPACE_NAME_MAX_LENGTH) {
    return protectedError("name_too_long");
  }

  const db = createDb(rc.env);
  const workspace = await createWorkspaceForApp(db, {
    appId: rc.appId,
    name,
  });

  try {
    await getAgentByName(rc.env.AppAgent, workspace.id);
  } catch (e) {
    await deleteWorkspaceForApp(db, rc.appId, workspace.id).catch(
      () => undefined
    );
    return protectedError(
      e instanceof Error ? e.message : "workspace_seed_failed",
      500
    );
  }

  return {
    status: 201 as const,
    body: { ok: true as const, workspace: wireWorkspace(workspace) },
  };
}

export async function handleRenameWorkspace(
  rc: AppCtx,
  workspaceId: string,
  body: RenameWorkspaceBody
): Promise<ProtectedReply<unknown>> {
  const name = body.name.trim();
  if (!name) {
    return protectedError("name_required");
  }
  if (name.length > WORKSPACE_NAME_MAX_LENGTH) {
    return protectedError("name_too_long");
  }

  const workspace = await renameWorkspaceForApp(
    createDb(rc.env),
    rc.appId,
    workspaceId,
    name
  );
  if (!workspace) {
    return protectedError("workspace_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, workspace: wireWorkspace(workspace) },
  };
}

export async function handleSetDefaultWorkspace(
  rc: AppCtx,
  workspaceId: string
): Promise<ProtectedReply<unknown>> {
  const workspace = await setDefaultWorkspaceForApp(
    createDb(rc.env),
    rc.appId,
    workspaceId
  );
  if (!workspace) {
    return protectedError("workspace_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, workspace: wireWorkspace(workspace) },
  };
}

export async function handleDeleteWorkspace(
  rc: AppCtx,
  workspaceId: string
): Promise<ProtectedReply<unknown>> {
  const db = createDb(rc.env);
  const workspace = await getWorkspaceUnscoped(db, workspaceId);
  if (!workspace || workspace.appId !== rc.appId) {
    return protectedError("workspace_not_found", 404);
  }
  if (workspace.isDefault) {
    return protectedError("cannot_delete_default_workspace", 409);
  }
  const total = await countWorkspacesForApp(db, rc.appId);
  if (total <= 1) {
    return protectedError("cannot_delete_last_workspace", 409);
  }

  await getAgentByName(rc.env.AppAgent, workspaceId)
    .then((agent) => agent.destroy())
    .catch(() => undefined);
  await appDataStub(rc.env, wsDataId(workspaceId))
    .destroy()
    .catch(() => undefined);

  const removed = await deleteWorkspaceForApp(db, rc.appId, workspaceId);
  if (!removed) {
    return protectedError("workspace_not_found", 404);
  }

  await deleteWorkspaceBuild(rc.env, workspaceId).catch(() => undefined);
  await deleteStoragePrefix(
    rc.env.CODE_R2,
    storageWorkspacePrefix(workspaceId)
  ).catch(() => undefined);

  return {
    status: 200 as const,
    body: { ok: true as const, workspaceId, removed: true as const },
  };
}
