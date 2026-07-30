import { errorMessage, throwIfUnauthorized } from "@/lib/api-errors";
import { client } from "@/lib/client";

const protectedApi = client.protected;

export const appsQueryKey = ["apps"] as const;
export const appQueryKey = (appId: string) => ["apps", appId] as const;
export const appAttemptQueryKey = (appId: string, attemptId: string) =>
  ["apps", appId, "attempts", attemptId] as const;

export const CREATING_POLL_MS = 2500;

export async function fetchApps() {
  const res = await protectedApi.apps.$get();
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list apps failed (${res.status})`)
    );
  }
  const body = await res.json();
  return { organizationId: body.organizationId, apps: body.apps };
}

export type AppRecord = Awaited<ReturnType<typeof fetchApps>>["apps"][number];

export async function fetchApp(appId: string) {
  const res = await protectedApi.apps[":appId"].$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get app failed (${res.status})`));
  }
  const body = await res.json();
  return body.app;
}

export async function fetchAttempt(appId: string, attemptId: string) {
  const res = await protectedApi.apps[":appId"].attempts[":attemptId"].$get({
    param: { appId, attemptId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get attempt failed (${res.status})`)
    );
  }
  const body = await res.json();
  return body.attempt;
}

export type AttemptRecord = Awaited<ReturnType<typeof fetchAttempt>>;

export async function fetchLiveSources(appId: string) {
  const res = await protectedApi.apps[":appId"].live.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get live sources failed (${res.status})`)
    );
  }
  const body = await res.json();
  return {
    liveSha: body.liveSha,
    sourceFiles: body.sourceFiles,
  };
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
