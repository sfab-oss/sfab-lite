/**
 * `/internal/*` — the host's own loopback surface. Not an API.
 *
 * Create runs here (alarm → SELF) so a killed isolate retries instead of
 * orphaning a `creating` row. Auth is a derived capability token.
 */

import TEMPLATE_SEED from "@sfab-lite/template/seed" with { type: "json" };
import { appCreateStub } from "../apps/app-stub.js";
import {
  INTERNAL_TOKEN_HEADER,
  verifyAttemptRun,
} from "../apps/internal-token.js";
import { settleCreateApp } from "../apps/registry.js";
import { createDb } from "../db/index.js";
import { runCdForSha } from "../forge/cd.js";
import { publishOrgEvent } from "../org-events.js";
import { createR2CodeHost } from "../storage/r2-code-host.js";
import type { RequestCtx } from "./routes.js";
import { NOT_FOUND_BODY } from "./routes.js";

const RE_RUN_CREATE =
  /^\/internal\/apps\/([^/]+)\/attempts\/([^/]+)\/run-create$/;

function notFound(): Response {
  return new Response(NOT_FOUND_BODY, { status: 404 });
}

/**
 * ensureRepo → commit TEMPLATE_SEED to main → CD → settle registry.
 */
async function handleRunCreate(
  rc: RequestCtx,
  appId: string,
  jobId: string
): Promise<Response> {
  const stub = appCreateStub(rc.env, appId);
  const host = createR2CodeHost(rc.env);

  try {
    await host.ensureRepo(appId);
    const { sha } = await host.commitTree(
      appId,
      TEMPLATE_SEED.sourceFiles,
      "chore: initial template seed"
    );
    const cd = await runCdForSha(
      rc.env,
      appId,
      sha,
      TEMPLATE_SEED.sourceFiles,
      { forceColdCheck: true }
    );
    if (!cd.ok) {
      await stub.failCreateJob(jobId, "fail", cd);
      const record = await settleCreateApp(createDb(rc.env), appId, "fail");
      if (record) {
        publishOrgEvent(
          { env: rc.env, organizationId: record.organizationId },
          { topic: "app_record_changed", payload: { appId } }
        );
      }
      return Response.json({
        ok: true,
        appId,
        attemptId: jobId,
        status: "fail",
      });
    }
    await stub.completeCreateJob(jobId, { liveSha: cd.liveSha });
    const record = await settleCreateApp(createDb(rc.env), appId, "pass");
    if (record) {
      publishOrgEvent(
        { env: rc.env, organizationId: record.organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    return Response.json({ ok: true, appId, attemptId: jobId, status: "pass" });
  } catch (e) {
    await stub
      .failCreateJob(jobId, "error", {
        error: "create_crashed",
        message: e instanceof Error ? e.message : String(e),
      })
      .catch(() => undefined);
    const record = await settleCreateApp(createDb(rc.env), appId, "error");
    if (record) {
      publishOrgEvent(
        { env: rc.env, organizationId: record.organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    return Response.json({
      ok: true,
      appId,
      attemptId: jobId,
      status: "error",
    });
  }
}

export async function dispatchInternal(rc: RequestCtx): Promise<Response> {
  const match = RE_RUN_CREATE.exec(rc.url.pathname);
  if (!match || rc.request.method !== "POST") {
    return notFound();
  }
  const appId = decodeURIComponent(match[1] ?? "");
  const jobId = decodeURIComponent(match[2] ?? "");

  const token = rc.request.headers.get(INTERNAL_TOKEN_HEADER);
  const secret = rc.env.BETTER_AUTH_SECRET;
  if (
    !(token && secret && (await verifyAttemptRun(secret, appId, jobId, token)))
  ) {
    return notFound();
  }

  return await handleRunCreate(rc, appId, jobId);
}
