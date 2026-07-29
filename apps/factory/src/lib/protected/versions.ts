import { getLiveSha } from "../../cd.js";
import { appStub } from "../../commit.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import { createR2CodeHost } from "../../r2-code-host.js";
import type { AppCtx } from "../../routes.js";

/** Live tip + optional source from the stored build (not AppDO versions). */
export async function handleGetLive(rc: AppCtx) {
  const { appId } = rc;
  const liveSha = await getLiveSha(rc.env, appId);
  if (!liveSha) {
    return protectedError("no_live_build", 404);
  }
  const build = await createR2CodeHost(rc.env).getBuild(appId, liveSha);
  if (!build) {
    return protectedError("no_live_build", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId,
      liveSha,
      sourceFiles: build.sourceFiles ?? {},
    },
  };
}

export async function handleGetAttempt(rc: AppCtx) {
  const { appId } = rc;
  const attemptId = rc.attemptId ?? decodeURIComponent(rc.match[2] ?? "");
  const { job } = await appStub(rc.env, appId).getCreateJob(attemptId);
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

export function handleListAttempts(
  _rc: AppCtx
): Promise<ProtectedReply<unknown>> {
  return Promise.resolve({
    status: 200,
    body: { ok: true as const, appId: _rc.appId, attempts: [] },
  });
}
