import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AppRecord, createApp, getApp, getAttempt, listApps } from "@/api";
import { createReadyApp } from "@/lib/create-ready-app";

const CREATING_POLL_MS = 2500;

const appsQueryKey = ["apps"] as const;
const appQueryKey = (appId: string) => ["apps", appId] as const;
const appAttemptQueryKey = (appId: string, attemptId: string) =>
  ["apps", appId, "attempts", attemptId] as const;

export function useApps() {
  return useQuery({
    queryKey: appsQueryKey,
    queryFn: listApps,
    refetchInterval: (query) =>
      query.state.data?.apps.some((app) => app.status === "creating")
        ? CREATING_POLL_MS
        : false,
  });
}

export function useApp(appId: string) {
  return useQuery({
    queryKey: appQueryKey(appId),
    queryFn: () => getApp(appId),
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
    queryFn: () => getAttempt(appId, attemptId as string),
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
