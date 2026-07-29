import { APP_NAME_MAX_LENGTH, pickAppName } from "../../app-names.js";
import {
  appStub,
  attemptAccepted,
  attemptConflict,
  attemptResolver,
} from "../../commit.js";
import { createDb } from "../../db/index.js";
import TEMPLATE_SEED from "../../generated/seed.json" with { type: "json" };
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { CreateAppBody, RenameAppBody } from "../../hono/schemas.js";
import { wireApp } from "../../hono/wire.js";
import {
  deleteAppUnscoped,
  getAppUnscoped,
  insertCreatingApp,
  listAppNamesForOrganization,
  listAppsForOrganization,
  markCreateFailed,
  organizationExists,
  renameAppUnscoped,
  setCreateAttemptId,
} from "../../registry.js";
import type { AppCtx, OrgCtx } from "../../routes.js";

/**
 * Create an app: D1 row first (`creating`), then bootstrap + async seed.
 *
 * App ids are server-minted (`app_…`). The old caller-supplied id path also
 * returned `alreadySeeded: true` on collision — with owning organizations that
 * was a tenancy hole (silently attach to whoever already held the name). Gone.
 *
 * The owning organization comes from the dispatcher: a session acts
 * on its own, a token must name one via `?organizationId=`. The body carries
 * only `name`. `registry.ts` was written to take the org as an argument and
 * needed no change.
 *
 * `name` is optional: the console does not have one to send, because the app
 * is created from a prompt describing what to build rather than what to call
 * it. Omitting it draws a placeholder from `app-names.ts`.
 */
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
  const stub = appStub(rc.env, appId);

  try {
    await stub.bootstrap(TEMPLATE_SEED.migrations);
  } catch (e) {
    await markCreateFailed(db, appId);
    return protectedError(
      e instanceof Error ? e.message : "bootstrap_failed",
      500
    );
  }

  const start = await stub.startAttempt("create", null);
  if (!start.ok) {
    await markCreateFailed(db, appId);
    return attemptConflict(appId, start.attemptId);
  }

  await setCreateAttemptId(db, appId, start.attemptId);
  await stub.scheduleCreateRun(start.attemptId);

  return attemptAccepted(appId, "create", start.attemptId, null, {
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
  const apps = await listAppsForOrganization(
    db,
    organizationId,
    attemptResolver(rc.env)
  );
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      organizationId,
      apps: apps.map(wireApp),
    },
  };
}

/**
 * Read one app's registry record.
 *
 * Dispatch already authorized this `appId`, so the read is by id alone —
 * same as every other app-scoped route. The stale-`creating` sweep lives
 * here because a status poll is when reconciling matters.
 */
export async function handleGetApp(rc: AppCtx) {
  const record = await getAppUnscoped(
    createDb(rc.env),
    rc.appId,
    attemptResolver(rc.env)
  );
  if (!record) {
    return protectedError("app_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
}

/**
 * Rename an app. The generated name is a placeholder, so replacing it is an
 * ordinary edit rather than a recovery from an error.
 */
export async function handleRenameApp(rc: AppCtx, body: RenameAppBody) {
  const name = body.name.trim();
  const record = await renameAppUnscoped(createDb(rc.env), rc.appId, name);
  if (!record) {
    return protectedError("app_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
}

/**
 * Delete an app: Durable Object storage first, registry row second.
 *
 * That order is the recoverable one. If the registry delete fails, a row is
 * left pointing at empty storage — visible in the console, and deleting again
 * finishes the job. The reverse leaves storage that no row indexes, and since
 * Durable Objects cannot be enumerated, nothing could ever find it again.
 *
 * Not idempotent by accident: a second delete still asks the DO (cheap, now
 * empty) and reports `removed: false` for the row, so a caller retrying after
 * a partial failure gets told what was actually left to do.
 */
export async function handleDeleteApp(
  rc: AppCtx
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const destroyed = await appStub(rc.env, appId).destroy();
  if (!destroyed.ok) {
    return { status: 409, body: { appId, ...destroyed } };
  }
  const removed = await deleteAppUnscoped(createDb(rc.env), appId);
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
  const touch = await appStub(rc.env, appId).touch();
  return { status: 200, body: { ok: true as const, appId, touch } };
}
