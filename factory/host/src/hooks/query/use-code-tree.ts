import { useQuery } from "@tanstack/react-query";
import { fetchTreeAtRef, treeQueryKey } from "@/lib/api/code-tree";

export function useTreeAtRef(appId: string, ref: string) {
  return useQuery({
    queryKey: treeQueryKey(appId, ref),
    queryFn: () => fetchTreeAtRef(appId, ref),
    enabled: Boolean(appId && ref),
  });
}
