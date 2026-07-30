import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";
import { createApp } from "@/lib/create-app";
import { createReadyApp } from "@/lib/create-ready-app";

const protectedApi = client.protected;

const CREATING_POLL_MS = 2500;

const appsQueryKey = ["apps"] as const;
const appQueryKey = (appId: string) => ["apps", appId] as const;
const appAttemptQueryKey = (appId: string, attemptId: string) =>
  ["apps", appId, "attempts", attemptId] as const;

export async function fetchApps() {
  const res = await protectedApi.apps.$get();
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list apps failed (${res.status})`)
    );
  }
  const body = await res.json();
  return { organizationId: body.organizationId, apps: body.apps };
}

export type AppRecord = Awaited<ReturnType<typeof fetchApps>>["apps"][number];

async function fetchApp(appId: string) {
  const res = await protectedApi.apps[":appId"].$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get app failed (${res.status})`));
  }
  const body = await res.json();
  return body.app;
}

async function fetchAttempt(appId: string, attemptId: string) {
  const res = await protectedApi.apps[":appId"].attempts[":attemptId"].$get({
    param: { appId, attemptId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get attempt failed (${res.status})`)
    );
  }
  const body = await res.json();
  return body.attempt;
}

export type AttemptRecord = Awaited<ReturnType<typeof fetchAttempt>>;

export async function fetchLiveSources(appId: string) {
  const res = await protectedApi.apps[":appId"].live.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get live sources failed (${res.status})`)
    );
  }
  const body = await res.json();
  return {
    liveSha: body.liveSha,
    sourceFiles: body.sourceFiles,
  };
}

export function useApps() {
  return useQuery({
    queryKey: appsQueryKey,
    queryFn: fetchApps,
    refetchInterval: (query) =>
      query.state.data?.apps.some((app) => app.status === "creating")
        ? CREATING_POLL_MS
        : false,
  });
}

export function useApp(appId: string) {
  return useQuery({
    queryKey: appQueryKey(appId),
    queryFn: () => fetchApp(appId),
    enabled: Boolean(appId),
    refetchInterval: (query) =>
      query.state.data?.status === "creating" ? CREATING_POLL_MS : false,
  });
}

export function useAppAttempt(
  appId: string,
  attemptId: string | null | undefined,
  options?: { poll?: boolean }
) {
  return useQuery({
    queryKey: appAttemptQueryKey(appId, attemptId ?? ""),
    queryFn: () => fetchAttempt(appId, attemptId as string),
    enabled: Boolean(appId && attemptId),
    refetchInterval: options?.poll ? CREATING_POLL_MS : false,
  });
}

/** Console create: returns on 202 (`creating`) so the UI can navigate immediately. */
export function useCreateApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createApp(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appsQueryKey }),
  });
}

/** Agent create: waits until the app is ready to open a handle/thread. */
export function useCreateReadyApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createReadyApp(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appsQueryKey }),
  });
}

export function readyAppsFromList(
  apps: AppRecord[] | undefined
): Array<{ appId: string; appName: string }> {
  if (!apps) {
    return [];
  }
  return apps
    .filter((app) => app.status === "ready")
    .map((app) => ({ appId: app.id, appName: app.name }));
}
