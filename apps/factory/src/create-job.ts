/**
 * Create-job helpers for the async app-create attempt surface.
 */

import { appCreateStub } from "./app-stub.js";
import type { AttemptResolver } from "./registry.js";

export type CreateJobAcceptedBody = {
  ok: true;
  appId: string;
  kind: "create";
  attemptId: string;
  parentId: null;
  status: "pending";
  poll: string;
} & Record<string, unknown>;

export function createAccepted(
  appId: string,
  jobId: string,
  extra?: Record<string, unknown>
): { status: 202; body: CreateJobAcceptedBody } {
  return {
    status: 202,
    body: {
      ok: true,
      appId,
      kind: "create",
      attemptId: jobId,
      parentId: null,
      status: "pending",
      poll: `/api/protected/apps/${encodeURIComponent(appId)}/attempts/${jobId}`,
      ...extra,
    },
  };
}

export function createConflict(
  appId: string,
  jobId: string
): {
  status: 409;
  body: {
    ok: false;
    error: "attempt_in_flight";
    appId: string;
    attemptId: string;
  };
} {
  return {
    status: 409,
    body: {
      ok: false,
      error: "attempt_in_flight",
      appId,
      attemptId: jobId,
    },
  };
}

export function attemptResolver(env: Env): AttemptResolver {
  return async (appId, jobId) => {
    const { job } = await appCreateStub(env, appId).getCreateJob(jobId);
    return job ? job.status : "missing";
  };
}
