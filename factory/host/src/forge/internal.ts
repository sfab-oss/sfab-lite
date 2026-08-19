/**
 * `/internal/*` — the host's own loopback surface. Not an API.
 *
 * Create runs here (alarm → SELF) so a killed isolate retries instead of
 * orphaning a `creating` row. Auth is a derived capability token.
 */

import { createR2CodeHost } from "../code-host/r2-code-host.js";
import { createDb } from "../db/index.js";
import { publishOrgEvent } from "../org-events.js";
import { overlayFormatFiles } from "../overlay-format-files.js";
import { getAppUnscoped, settleCreateApp } from "../registry/app-registry.js";
import { appCreateStub } from "../registry/app-stub.js";
import {
  INTERNAL_TOKEN_HEADER,
  verifyAttemptRun,
} from "../registry/internal-token.js";
import type { RequestCtx } from "../serve/routes.js";
import { NOT_FOUND_BODY } from "../serve/routes.js";
import { getStarter } from "../starters/catalog.js";
import { runCdForSha } from "./cd.js";
import {
  type CreateStages,
  type CreateStageTimings,
  finishStages,
  stagesLogLine,
} from "./stages.js";

const RE_RUN_CREATE =
  /^\/internal\/apps\/([^/]+)\/attempts\/([^/]+)\/run-create$/;

function notFound(): Response {
  return new Response(NOT_FOUND_BODY, { status: 404 });
}

/**
 * ensureRepo → commit starter seed to main → CD → settle registry.
 */
async function handleRunCreate(
  rc: RequestCtx,
  appId: string,
  jobId: string
): Promise<Response> {
  const stub = appCreateStub(rc.env, appId);
  const host = createR2CodeHost(rc.env);
  const startedAtMs = Date.now();
  const timings: CreateStageTimings = {};

  const logStages = (): void => {
    const stages: CreateStages = finishStages(startedAtMs, timings);
    console.log(stagesLogLine("create", appId, stages));
  };

  try {
    const record = await getAppUnscoped(createDb(rc.env), appId);
    if (record == null) {
      throw new Error("create run: app row missing");
    }
    const starter = getStarter(record.template);
    if (starter == null) {
      throw new Error(`create run: unknown template ${record.template}`);
    }

    let lap = Date.now();
    await host.ensureRepo(appId);
    timings.ensureRepoMs = Date.now() - lap;
    const sourceFiles = overlayFormatFiles(
      starter.seed.sourceFiles as Record<string, string>
    ).files;
    lap = Date.now();
    const { sha } = await host.commitTree(
      appId,
      sourceFiles,
      "chore: initial template seed"
    );
    timings.commitTreeMs = Date.now() - lap;
    lap = Date.now();
    const cd = await runCdForSha(rc.env, appId, sha, sourceFiles, {
      forceColdCheck: true,
    });
    timings.cdMs = Date.now() - lap;
    if (!cd.ok) {
      lap = Date.now();
      await stub.failCreateJob(jobId, "fail", cd);
      const settled = await settleCreateApp(createDb(rc.env), appId, "fail");
      if (settled) {
        publishOrgEvent(
          { env: rc.env, organizationId: settled.organizationId },
          { topic: "app_record_changed", payload: { appId } }
        );
      }
      timings.settleMs = Date.now() - lap;
      logStages();
      return Response.json({
        ok: true,
        appId,
        attemptId: jobId,
        status: "fail",
      });
    }
    lap = Date.now();
    await stub.completeCreateJob(jobId, { liveSha: cd.liveSha });
    const settled = await settleCreateApp(createDb(rc.env), appId, "pass");
    if (settled) {
      publishOrgEvent(
        { env: rc.env, organizationId: settled.organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    timings.settleMs = Date.now() - lap;
    logStages();
    return Response.json({ ok: true, appId, attemptId: jobId, status: "pass" });
  } catch (e) {
    const lap = Date.now();
    await stub
      .failCreateJob(jobId, "error", {
        error: "create_crashed",
        message: e instanceof Error ? e.message : String(e),
      })
      .catch(() => undefined);
    const settled = await settleCreateApp(createDb(rc.env), appId, "error");
    if (settled) {
      publishOrgEvent(
        { env: rc.env, organizationId: settled.organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    timings.settleMs = Date.now() - lap;
    logStages();
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
