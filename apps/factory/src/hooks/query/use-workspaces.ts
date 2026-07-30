import { useQuery } from "@tanstack/react-query";
import {
  defaultWorkspaceQueryKey,
  fetchDefaultWorkspace,
  fetchWorkspaces,
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
