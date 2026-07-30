import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const protectedApi = client.protected;

const prsQueryKey = (appId: string) => ["apps", appId, "prs"] as const;
const prQueryKey = (appId: string, number: number) =>
  ["apps", appId, "prs", number] as const;
const prDiffQueryKey = (appId: string, number: number) =>
  ["apps", appId, "prs", number, "diff"] as const;
const runsQueryKey = (appId: string) => ["apps", appId, "runs"] as const;
const runQueryKey = (appId: string, runId: string) =>
  ["apps", appId, "runs", runId] as const;

async function fetchPrs(appId: string) {
  const res = await protectedApi.apps[":appId"].prs.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `list prs failed (${res.status})`));
  }
  const body = await res.json();
  return body.prs;
}

export type PrRecord = Awaited<ReturnType<typeof fetchPrs>>[number];

async function fetchPr(appId: string, number: number) {
  const res = await protectedApi.apps[":appId"].prs[":number"].$get({
    param: { appId, number: String(number) },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get pr failed (${res.status})`));
  }
  return res.json();
}

async function fetchPrDiff(appId: string, number: number) {
  const res = await protectedApi.apps[":appId"].prs[":number"].diff.$get({
    param: { appId, number: String(number) },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get pr diff failed (${res.status})`)
    );
  }
  const body = await res.json();
  return {
    baseSha: body.baseSha,
    headSha: body.headSha,
    changedPaths: body.changedPaths,
    files: body.files,
  };
}

export type PrDiffFile = Awaited<
  ReturnType<typeof fetchPrDiff>
>["files"][number];

async function fetchRuns(
  appId: string,
  opts?: { sha?: string; limit?: number }
) {
  const res = await protectedApi.apps[":appId"].runs.$get({
    param: { appId },
    query: {
      ...(opts?.sha ? { sha: opts.sha } : {}),
      ...(opts?.limit == null ? {} : { limit: opts.limit }),
    },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list runs failed (${res.status})`)
    );
  }
  const body = await res.json();
  return body.runs;
}

export type CheckRunRecord = Awaited<ReturnType<typeof fetchRuns>>[number];

async function fetchRun(appId: string, runId: string) {
  const res = await protectedApi.apps[":appId"].runs[":runId"].$get({
    param: { appId, runId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get run failed (${res.status})`));
  }
  const body = await res.json();
  return body.run;
}

async function createPr(
  appId: string,
  input: {
    title: string;
    body?: string;
    headBranch: string;
    baseBranch?: string;
  }
) {
  const res = await protectedApi.apps[":appId"].prs.$post({
    param: { appId },
    json: input,
  });
  throwIfUnauthorized(res);
  if (res.status !== 201) {
    throw new Error(
      await errorMessage(res, `create pr failed (${res.status})`)
    );
  }
  const body = await res.json();
  return { pr: body.pr, checkRun: body.checkRun };
}

async function mergePr(appId: string, number: number) {
  const res = await protectedApi.apps[":appId"].prs[":number"].merge.$post({
    param: { appId, number: String(number) },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `merge pr failed (${res.status})`));
  }
  const body = await res.json();
  return { pr: body.pr, liveSha: body.liveSha };
}

async function rerunRun(appId: string, runId: string) {
  const res = await protectedApi.apps[":appId"].runs[":runId"].rerun.$post({
    param: { appId, runId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `rerun failed (${res.status})`));
  }
  const body = await res.json();
  return body.run;
}

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
