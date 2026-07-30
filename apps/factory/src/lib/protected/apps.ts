/**
 * Create an app: D1 row first (`creating`), then bootstrap live AppDataDO +
 * async seed via code host (TEMPLATE_SEED → main → CD → live_sha).
 */

import TEMPLATE_SEED from "@sfab-lite/template/seed" with { type: "json" };
import { publishOrgEvent } from "@/org-events.js";
import { createDb } from "../../db/index.js";
import { listPullRequests } from "../../forge/forge.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { CreateAppBody, RenameAppBody } from "../../hono/schemas.js";
import { wireApp } from "../../hono/wire.js";
import { prDataId } from "../../registry/app-data-ids.js";
import { APP_NAME_MAX_LENGTH, pickAppName } from "../../registry/app-names.js";
import {
  deleteAppUnscoped,
  getAppOrganizationId,
  getAppUnscoped,
  insertCreatingApp,
  listAppNamesForOrganization,
  listAppsForOrganization,
  markCreateFailed,
  organizationExists,
  renameAppUnscoped,
  setCreateAttemptId,
} from "../../registry/app-registry.js";
import {
  appCreateStub,
  appDataStub,
  liveAppDataStub,
} from "../../registry/app-stub.js";
import {
  attemptResolver,
  createAccepted,
  createConflict,
} from "../../registry/create-job.js";
import { reconcileCreatingApps } from "../../registry/create-reconcile.js";
import type { AppCtx, OrgCtx } from "../../serve/routes.js";

export async function handleCreateApp(rc: OrgCtx, body: CreateAppBody) {
  const { organizationId } = rc;
  const requested = body.name?.trim();
  if (requested && requested.length > APP_NAME_MAX_LENGTH) {
    return protectedError("name_too_long");
  }

  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return protectedError("organization_not_found", 404);
  }

  const name =
    requested ||
    pickAppName(await listAppNamesForOrganization(db, organizationId));

  const created = await insertCreatingApp(db, { organizationId, name });
  const appId = created.id;
  const data = liveAppDataStub(rc.env, appId);
  const create = appCreateStub(rc.env, appId);

  try {
    await data.bootstrap(TEMPLATE_SEED.migrations);
  } catch (e) {
    const failed = await markCreateFailed(db, appId);
    if (failed) {
      publishOrgEvent(
        { env: rc.env, organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    return protectedError(
      e instanceof Error ? e.message : "bootstrap_failed",
      500
    );
  }

  const start = await create.startCreateJob();
  if (!start.ok) {
    const failed = await markCreateFailed(db, appId);
    if (failed) {
      publishOrgEvent(
        { env: rc.env, organizationId },
        { topic: "app_record_changed", payload: { appId } }
      );
    }
    return createConflict(appId, start.jobId);
  }

  await setCreateAttemptId(db, appId, start.jobId);
  await create.scheduleCreateRun(start.jobId);

  return createAccepted(appId, start.jobId, {
    organizationId,
    name,
    appStatus: "creating",
  });
}

export async function handleListApps(rc: OrgCtx) {
  const { organizationId } = rc;
  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return protectedError("organization_not_found", 404);
  }
  await reconcileCreatingApps(rc.env, db, attemptResolver(rc.env));
  const apps = await listAppsForOrganization(db, organizationId);
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      organizationId,
      apps: apps.map(wireApp),
    },
  };
}

export async function handleGetApp(rc: AppCtx) {
  const db = createDb(rc.env);
  await reconcileCreatingApps(rc.env, db, attemptResolver(rc.env));
  const record = await getAppUnscoped(db, rc.appId);
  if (!record) {
    return protectedError("app_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
}

export async function handleRenameApp(rc: AppCtx, body: RenameAppBody) {
  const name = body.name.trim();
  const record = await renameAppUnscoped(createDb(rc.env), rc.appId, name);
  if (!record) {
    return protectedError("app_not_found", 404);
  }
  publishOrgEvent(
    { env: rc.env, organizationId: record.organizationId },
    { topic: "app_record_changed", payload: { appId: rc.appId } }
  );
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
}

export async function handleDeleteApp(
  rc: AppCtx
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const db = createDb(rc.env);
  const organizationId = await getAppOrganizationId(db, appId);
  const destroyed = await liveAppDataStub(rc.env, appId).destroy();
  await appCreateStub(rc.env, appId)
    .destroy()
    .catch(() => undefined);
  const prs = await listPullRequests(rc.env, appId);
  await Promise.all(
    prs.map((pr) =>
      appDataStub(rc.env, prDataId(appId, pr.number))
        .destroy()
        .catch(() => undefined)
    )
  );
  const removed = await deleteAppUnscoped(db, appId);
  if (organizationId) {
    publishOrgEvent(
      { env: rc.env, organizationId },
      { topic: "app_list_changed", payload: { appId } }
    );
  }
  return {
    status: 200,
    body: {
      ok: true as const,
      appId,
      removed,
      bytesFreed: destroyed.bytesFreed,
    },
  };
}

export async function handleTouch(
  rc: AppCtx
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const touch = await liveAppDataStub(rc.env, appId).touch();
  return { status: 200, body: { ok: true as const, appId, touch } };
}
