import { useQuery } from "@tanstack/react-query";
import { getTreeAtRef } from "@/api";

const treeQueryKey = (appId: string, ref: string) =>
  ["apps", appId, "tree", ref] as const;

export function useTreeAtRef(appId: string, ref: string) {
  return useQuery({
    queryKey: treeQueryKey(appId, ref),
    queryFn: () => getTreeAtRef(appId, ref),
    enabled: Boolean(appId && ref),
  });
}
