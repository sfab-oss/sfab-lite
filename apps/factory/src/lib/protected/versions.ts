import { appStub } from "../../commit.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { AppCtx } from "../../routes.js";

export async function handleListVersions(rc: AppCtx) {
  const { appId } = rc;
  const listed = await appStub(rc.env, appId).listVersions();
  return { status: 200 as const, body: { appId, ...listed } };
}

export async function handleGetLive(rc: AppCtx) {
  const { appId } = rc;
  const live = await appStub(rc.env, appId).getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return protectedError("no_live_version", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId,
      liveVersionId: live.liveVersionId,
      sourceFiles: live.version.sourceFiles,
    },
  };
}

export async function handleGetAttempt(rc: AppCtx) {
  const { appId } = rc;
  const attemptId = rc.attemptId ?? decodeURIComponent(rc.match[2] ?? "");
  const { attempt } = await appStub(rc.env, appId).getAttempt(attemptId);
  if (!attempt) {
    return protectedError("attempt_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, appId, attempt },
  };
}

export async function handleListAttempts(
  rc: AppCtx
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const raw = Number(rc.url.searchParams.get("limit"));
  const { attempts } = await appStub(rc.env, appId).listAttempts(
    Number.isFinite(raw) && raw > 0 ? raw : undefined
  );
  return { status: 200, body: { ok: true as const, appId, attempts } };
}
