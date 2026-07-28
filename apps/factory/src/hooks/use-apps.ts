import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AppRecord,
  deleteApp,
  getApp,
  getAttempt,
  listApps,
  listVersions,
  renameApp,
} from "@/api";
import { createReadyApp } from "@/lib/create-ready-app";

const CREATING_POLL_MS = 2500;

const appsQueryKey = ["apps"] as const;
const appQueryKey = (appId: string) => ["apps", appId] as const;
const appVersionsQueryKey = (appId: string) =>
  ["apps", appId, "versions"] as const;
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

export function useAppVersions(appId: string, enabled: boolean) {
  return useQuery({
    queryKey: appVersionsQueryKey(appId),
    queryFn: () => listVersions(appId),
    enabled: Boolean(appId) && enabled,
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

export function useCreateApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => createReadyApp(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: appsQueryKey }),
  });
}

export function useRenameApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, name }: { appId: string; name: string }) =>
      renameApp(appId, name),
    onSuccess: (updated) => {
      queryClient.setQueryData(appQueryKey(updated.id), updated);
      return queryClient.invalidateQueries({ queryKey: appsQueryKey });
    },
  });
}

export function useDeleteApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) => deleteApp(appId),
    onSuccess: (_result, appId) => {
      queryClient.removeQueries({ queryKey: appQueryKey(appId) });
      return queryClient.invalidateQueries({ queryKey: appsQueryKey });
    },
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
