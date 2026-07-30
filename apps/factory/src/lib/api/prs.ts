import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const protectedApi = client.protected;

export const prsQueryKey = (appId: string) => ["apps", appId, "prs"] as const;
export const prQueryKey = (appId: string, number: number) =>
  ["apps", appId, "prs", number] as const;
export const prDiffQueryKey = (appId: string, number: number) =>
  ["apps", appId, "prs", number, "diff"] as const;
export const runsQueryKey = (appId: string) => ["apps", appId, "runs"] as const;
export const runQueryKey = (appId: string, runId: string) =>
  ["apps", appId, "runs", runId] as const;

export async function fetchPrs(appId: string) {
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

export async function fetchPr(appId: string, number: number) {
  const res = await protectedApi.apps[":appId"].prs[":number"].$get({
    param: { appId, number: String(number) },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get pr failed (${res.status})`));
  }
  return res.json();
}

export async function fetchPrDiff(appId: string, number: number) {
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

export async function fetchRuns(
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

export async function fetchRun(appId: string, runId: string) {
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

export async function createPr(
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

export async function mergePr(appId: string, number: number) {
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

export async function rerunRun(appId: string, runId: string) {
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
