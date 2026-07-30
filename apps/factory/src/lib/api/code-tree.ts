import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const protectedApi = client.protected;

export const treeQueryKey = (appId: string, ref: string) =>
  ["apps", appId, "tree", ref] as const;

export async function fetchTreeAtRef(appId: string, ref = "main") {
  const res = await protectedApi.apps[":appId"].tree.$get({
    param: { appId },
    query: { ref },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get tree failed (${res.status})`));
  }
  const body = await res.json();
  return {
    ref: body.ref,
    sha: body.sha,
    branches: body.branches,
    sourceFiles: body.sourceFiles,
  };
}
