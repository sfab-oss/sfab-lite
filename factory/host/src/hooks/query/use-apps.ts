import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appAttemptQueryKey,
  appQueryKey,
  appsQueryKey,
  CREATING_POLL_MS,
  fetchApp,
  fetchApps,
  fetchAttempt,
} from "@/lib/api/apps";
import { createApp } from "@/lib/create-app";
import { createReadyApp } from "@/lib/create-ready-app";

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
    mutationFn: (input?: { name?: string; template?: string } | string) => {
      if (typeof input === "string" || input === undefined) {
        return createApp(input);
      }
      return createApp(input.name, input.template);
    },
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
