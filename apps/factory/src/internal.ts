/**
 * `/internal/*` — the host's own loopback surface. Not an API.
 *
 * Only the AppDO calls this, over `SELF`, from an alarm. It exists because a
 * create attempt has to run somewhere with a real lifetime: `ctx.waitUntil` is
 * killed at ~30s and a killed attempt writes no terminal status, which is what
 * leaves an app stuck in `creating` until the stale sweep reclaims it. An
 * ordinary request handler has no such cap, and the alarm that drives it
 * survives the invocation, so a death becomes a retry instead of an orphan.
 *
 * Every route here is authenticated by a derived capability token
 * (`internal-token.ts`), never by session or admin token — the caller is a
 * Durable Object, which has neither.
 */
import { runCommitAttempt } from "./commit.js";
import { createDb } from "./db/index.js";
import TEMPLATE_SEED from "./generated/seed.json" with { type: "json" };
import { INTERNAL_TOKEN_HEADER, verifyAttemptRun } from "./internal-token.js";
import { publishOrgEvent } from "./org-events.js";
import { settleCreateApp } from "./registry.js";
import type { RequestCtx } from "./routes.js";
import { NOT_FOUND_BODY } from "./routes.js";

const RE_RUN_CREATE =
  /^\/internal\/apps\/([^/]+)\/attempts\/([^/]+)\/run-create$/;

/**
 * Unauthorized is 404, not 401: an unauthenticated caller learns nothing about
 * whether the route is there. Same reasoning as the sub-app seed route.
 */
function notFound(): Response {
  return new Response(NOT_FOUND_BODY, { status: 404 });
}

/**
 * Run a create attempt to a terminal status, and settle its registry row.
 *
 * The seed is a bundle constant, which is the whole reason a create can be
 * retried at all — there is no workspace to persist and replay, so the DO only
 * has to remember two ids. An ordinary commit carries the agent's files and
 * has no such property; it still runs under `waitUntil`.
 */
async function handleRunCreate(
  rc: RequestCtx,
  appId: string,
  attemptId: string
): Promise<Response> {
  const status = await runCommitAttempt(
    rc.env,
    appId,
    attemptId,
    TEMPLATE_SEED.sourceFiles,
    null,
    { forceColdCheck: true }
  );
  const attemptStatus = status === "aborted" ? "error" : status;
  const record = await settleCreateApp(createDb(rc.env), appId, attemptStatus);
  if (record) {
    publishOrgEvent(
      { env: rc.env, organizationId: record.organizationId },
      { topic: "app_list_changed", payload: { appId } }
    );
  }
  return Response.json({ ok: true, appId, attemptId, status });
}

export async function dispatchInternal(rc: RequestCtx): Promise<Response> {
  const match = RE_RUN_CREATE.exec(rc.url.pathname);
  if (!match || rc.request.method !== "POST") {
    return notFound();
  }
  const appId = decodeURIComponent(match[1] ?? "");
  const attemptId = decodeURIComponent(match[2] ?? "");

  const token = rc.request.headers.get(INTERNAL_TOKEN_HEADER);
  const secret = rc.env.BETTER_AUTH_SECRET;
  if (
    !(
      token &&
      secret &&
      (await verifyAttemptRun(secret, appId, attemptId, token))
    )
  ) {
    return notFound();
  }

  return await handleRunCreate(rc, appId, attemptId);
}
