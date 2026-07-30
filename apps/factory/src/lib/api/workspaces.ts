import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const protectedApi = client.protected;

export const workspacesQueryKey = (appId: string) =>
  ["apps", appId, "workspaces"] as const;

export const defaultWorkspaceQueryKey = (appId: string) =>
  ["apps", appId, "workspaces", "default"] as const;

export async function fetchWorkspaces(appId: string) {
  const res = await protectedApi.apps[":appId"].workspaces.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list workspaces failed (${res.status})`)
    );
  }
  const body = await res.json();
  return body.workspaces;
}

export type WorkspaceRecord = Awaited<
  ReturnType<typeof fetchWorkspaces>
>[number];

export async function fetchDefaultWorkspace(appId: string) {
  const res = await protectedApi.apps[":appId"].workspaces.default.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get default workspace failed (${res.status})`)
    );
  }
  const body = await res.json();
  if (!body.ok) {
    throw new Error("get default workspace failed");
  }
  return body.workspace;
}

export async function fetchWorkspace(
  appId: string,
  workspaceId: string
): Promise<WorkspaceRecord | null> {
  const res = await protectedApi.apps[":appId"].workspaces[":workspaceId"].$get(
    {
      param: { appId, workspaceId },
    }
  );
  throwIfUnauthorized(res);
  if (res.status === 404) {
    return null;
  }
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get workspace failed (${res.status})`)
    );
  }
  const body = (await res.json()) as
    | { ok: true; workspace: WorkspaceRecord }
    | { ok: false };
  if (!body.ok) {
    return null;
  }
  return body.workspace;
}
