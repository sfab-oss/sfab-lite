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

function mutationError(body: unknown, fallback: string): Error {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return new Error((body as { error: string }).error);
  }
  return new Error(fallback);
}

export async function createWorkspace(appId: string, name: string) {
  const res = await protectedApi.apps[":appId"].workspaces.$post({
    param: { appId },
    json: { name },
  });
  throwIfUnauthorized(res);
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      await errorMessage(res, `create workspace failed (${res.status})`)
    );
  }
  const body = (await res.json()) as
    | { ok: true; workspace: WorkspaceRecord }
    | { ok: false; error?: string }
    | null;
  if (!body?.ok) {
    throw mutationError(body, "create workspace failed");
  }
  return body.workspace;
}

export async function renameWorkspace(
  appId: string,
  workspaceId: string,
  name: string
) {
  const res = await protectedApi.apps[":appId"].workspaces[
    ":workspaceId"
  ].$patch({
    param: { appId, workspaceId },
    json: { name },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `rename workspace failed (${res.status})`)
    );
  }
  const body = (await res.json()) as
    | { ok: true; workspace: WorkspaceRecord }
    | { ok: false; error?: string }
    | null;
  if (!body?.ok) {
    throw mutationError(body, "rename workspace failed");
  }
  return body.workspace;
}

export async function setDefaultWorkspace(appId: string, workspaceId: string) {
  const res = await protectedApi.apps[":appId"].workspaces[
    ":workspaceId"
  ].default.$post({
    param: { appId, workspaceId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `set default workspace failed (${res.status})`)
    );
  }
  const body = (await res.json()) as
    | { ok: true; workspace: WorkspaceRecord }
    | { ok: false; error?: string }
    | null;
  if (!body?.ok) {
    throw mutationError(body, "set default workspace failed");
  }
  return body.workspace;
}

export async function deleteWorkspace(appId: string, workspaceId: string) {
  const res = await protectedApi.apps[":appId"].workspaces[
    ":workspaceId"
  ].$delete({
    param: { appId, workspaceId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `delete workspace failed (${res.status})`)
    );
  }
  const body = (await res.json()) as
    | { ok: true; workspaceId: string; removed: true }
    | { ok: false; error?: string }
    | null;
  if (!body?.ok) {
    throw mutationError(body, "delete workspace failed");
  }
  return body;
}
