import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkspace,
  defaultWorkspaceQueryKey,
  deleteWorkspace,
  fetchDefaultWorkspace,
  fetchWorkspaces,
  renameWorkspace,
  setDefaultWorkspace,
  workspacesQueryKey,
} from "@/lib/api/workspaces";

export function useWorkspaces(appId: string) {
  return useQuery({
    queryKey: workspacesQueryKey(appId),
    queryFn: () => fetchWorkspaces(appId),
    enabled: Boolean(appId),
  });
}

export function useDefaultWorkspace(appId: string) {
  return useQuery({
    queryKey: defaultWorkspaceQueryKey(appId),
    queryFn: () => fetchDefaultWorkspace(appId),
    enabled: Boolean(appId),
  });
}

function invalidateWorkspaceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  appId: string
) {
  queryClient.invalidateQueries({ queryKey: workspacesQueryKey(appId) });
  queryClient.invalidateQueries({
    queryKey: defaultWorkspaceQueryKey(appId),
  });
}

export function useCreateWorkspace(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createWorkspace(appId, name),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, appId),
  });
}

export function useRenameWorkspace(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      name,
    }: {
      workspaceId: string;
      name: string;
    }) => renameWorkspace(appId, workspaceId, name),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, appId),
  });
}

export function useSetDefaultWorkspace(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) =>
      setDefaultWorkspace(appId, workspaceId),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, appId),
  });
}

export function useDeleteWorkspace(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => deleteWorkspace(appId, workspaceId),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, appId),
  });
}
