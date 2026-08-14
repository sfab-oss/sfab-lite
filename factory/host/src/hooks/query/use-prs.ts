import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPr,
  fetchPr,
  fetchPrDiff,
  fetchPrs,
  fetchRun,
  fetchRuns,
  mergePr,
  prDiffQueryKey,
  prQueryKey,
  prsQueryKey,
  rerunRun,
  runQueryKey,
  runsQueryKey,
} from "@/lib/api/prs";

export function usePrs(appId: string) {
  return useQuery({
    queryKey: prsQueryKey(appId),
    queryFn: () => fetchPrs(appId),
    enabled: Boolean(appId),
  });
}

export function usePr(appId: string, number: number) {
  return useQuery({
    queryKey: prQueryKey(appId, number),
    queryFn: () => fetchPr(appId, number),
    enabled: Boolean(appId && number > 0),
  });
}

export function usePrDiff(appId: string, number: number) {
  return useQuery({
    queryKey: prDiffQueryKey(appId, number),
    queryFn: () => fetchPrDiff(appId, number),
    enabled: Boolean(appId && number > 0),
  });
}

export function useRuns(appId: string) {
  return useQuery({
    queryKey: runsQueryKey(appId),
    queryFn: () => fetchRuns(appId, { limit: 50 }),
    enabled: Boolean(appId),
  });
}

export function useRun(appId: string, runId: string | null) {
  return useQuery({
    queryKey: runQueryKey(appId, runId ?? ""),
    queryFn: () => {
      if (!runId) {
        throw new Error("run id required");
      }
      return fetchRun(appId, runId);
    },
    enabled: Boolean(appId && runId),
  });
}

export function useCreatePr(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      body?: string;
      headBranch: string;
      baseBranch?: string;
    }) => createPr(appId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prsQueryKey(appId) });
      queryClient.invalidateQueries({ queryKey: runsQueryKey(appId) });
    },
  });
}

export function useMergePr(appId: string, number: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mergePr(appId, number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prQueryKey(appId, number) });
      queryClient.invalidateQueries({ queryKey: prsQueryKey(appId) });
      queryClient.invalidateQueries({ queryKey: ["apps", appId] });
    },
  });
}

export function useRerun(appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const next = await rerunRun(appId, runId);
      await fetchRun(appId, next.id);
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runsQueryKey(appId) });
      queryClient.invalidateQueries({ queryKey: ["apps", appId, "prs"] });
    },
  });
}
