import { createCodeHost } from "../../code-host/artifacts-code-host.js";
import { getLiveSha } from "../../forge/cd.js";
import { protectedError } from "../../hono/reply.js";
import { appCreateStub } from "../../registry/app-stub.js";
import type { AppCtx } from "../../serve/routes.js";

/** Live tip + source tree from the code host at `live_sha`. */
export async function handleGetLive(rc: AppCtx) {
  const { appId } = rc;
  const liveSha = await getLiveSha(rc.env, appId);
  if (!liveSha) {
    return protectedError("no_live_build", 404);
  }
  const sourceFiles = await createCodeHost(rc.env).readTreeAt(appId, liveSha);
  if (!sourceFiles) {
    return protectedError("no_live_build", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId,
      liveSha,
      sourceFiles,
    },
  };
}

export async function handleGetAttempt(rc: AppCtx) {
  const { appId } = rc;
  const attemptId = rc.attemptId ?? "";
  const { job } = await appCreateStub(rc.env, appId).getCreateJob(attemptId);
  if (!job) {
    return protectedError("attempt_not_found", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId,
      attempt: {
        id: job.id,
        kind: "create" as const,
        status: job.status,
        parentId: null,
        versionId: null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        payload: job.payload,
      },
    },
  };
}
