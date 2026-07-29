import { mergeSources } from "@sfab-lite/core";
import {
  appStub,
  callCheck,
  checkPasses,
  enqueueCommit,
} from "../../commit.js";
import { createDb } from "../../db/index.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { CheckBody, CommitBody, RevertBody } from "../../hono/schemas.js";
import { publishOrgEvent } from "../../org-events.js";
import { getAppOrganizationId } from "../../registry.js";
import type { AppCtx } from "../../routes.js";

export async function handleCheck(
  rc: AppCtx,
  body: CheckBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const latest = await appStub(rc.env, appId).getLatest();
  const base = latest.version?.sourceFiles ?? {};
  if (!latest.version?.sourceFiles) {
    return protectedError("no_version_with_sources", 404);
  }
  const files = mergeSources(base, body.files ?? {});
  const check = await callCheck(rc.env, appId, files, body.forceCold !== false);
  const pass = checkPasses(check.body);
  return {
    status: 200,
    body: {
      ok: check.http < 500 && Boolean(check.body?.ok),
      appId,
      baseVersionId: latest.version.id,
      wallMs: check.wallMs,
      publishGate: pass,
      check: check.body,
    },
  };
}

export async function handleCommit(
  rc: AppCtx,
  body: CommitBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const stub = appStub(rc.env, appId);
  const live = await stub.getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return protectedError("no_live_version", 404);
  }
  const files = mergeSources(live.version.sourceFiles, body.files);
  return enqueueCommit(
    rc.env,
    rc.ctx,
    appId,
    "commit",
    files,
    live.liveVersionId
  );
}

export async function handleRevert(
  rc: AppCtx,
  body: RevertBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const result = await appStub(rc.env, appId).revertTo(body.versionId);
  if (!result.ok) {
    return {
      status: result.error === "attempt_in_flight" ? 409 : 404,
      body: { appId, ...result },
    };
  }
  const organizationId =
    rc.actor.kind === "session"
      ? rc.actor.organizationId
      : await getAppOrganizationId(createDb(rc.env), appId);
  if (organizationId) {
    publishOrgEvent(
      { env: rc.env, organizationId },
      {
        topic: "app_live_version_changed",
        payload: { appId, liveVersionId: result.liveVersionId },
      }
    );
  }
  return { status: 200, body: { appId, action: "revert" as const, ...result } };
}
