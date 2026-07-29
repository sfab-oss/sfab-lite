/**
 * App registry — the D1 index that makes apps enumerable.
 *
 * Durable Objects cannot be listed (`idFromName` is a hash), so every created
 * app must land a row here before its AppDO is seeded. Create/list take an
 * `organizationId` from the dispatcher (`OrgCtx`); app-scoped reads
 * (`getAppUnscoped`) are by id alone after `requireAppAccess`.
 */
import { and, desc, eq } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import { STALE_ATTEMPT_MS } from "./app-do.js";
import type { Db } from "./db/index.js";
import { app, organization } from "./db/schema.js";
import { publishOrgEvent } from "./org-events.js";

const nextUlid = monotonicFactory();

type AppStatus = "creating" | "ready" | "failed";

export interface AppRecord {
  id: string;
  organizationId: string;
  name: string;
  status: AppStatus;
  createAttemptId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function newAppId(): string {
  return `app_${nextUlid()}`;
}

function toRecord(row: typeof app.$inferSelect): AppRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as AppStatus,
    createAttemptId: row.createAttemptId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** True when a row exists in `organization` — the only tenancy check we own. */
export async function organizationExists(
  db: Db,
  organizationId: string
): Promise<boolean> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Ownership test for app-scoped admin routes — one indexed read, nothing else.
 *
 * Kept separate from `getAppUnscoped` on purpose: `getAppUnscoped` runs the
 * stale-`creating` sweep, which is right for a status read and wrong for an
 * authorization check that sits on the attempt-polling hot path.
 */
export async function appBelongsToOrganization(
  db: Db,
  organizationId: string,
  appId: string
): Promise<boolean> {
  const row = await db.query.app.findFirst({
    where: and(eq(app.id, appId), eq(app.organizationId, organizationId)),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Insert the registry row *before* any AppDO work. Status starts at
 * `creating` so a UI can poll during the ~18–25s seed commit.
 */
export async function insertCreatingApp(
  db: Db,
  input: { organizationId: string; name: string }
): Promise<AppRecord> {
  const id = newAppId();
  const now = new Date();
  const [row] = await db
    .insert(app)
    .values({
      id,
      organizationId: input.organizationId,
      name: input.name,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) {
    throw new Error("insertCreatingApp: insert returned no row");
  }
  return toRecord(row);
}

export async function setCreateAttemptId(
  db: Db,
  appId: string,
  attemptId: string
): Promise<void> {
  await db
    .update(app)
    .set({ createAttemptId: attemptId })
    .where(and(eq(app.id, appId), eq(app.status, "creating")));
}

/**
 * Map a terminal seed-attempt status onto the registry row.
 *
 * Only touches rows still in `creating` so a late/duplicate settle cannot
 * clobber `ready`/`failed`. `create_attempt_id` clears on ready (schema
 * contract); it stays on failed so the failure can still be polled.
 */
export async function settleCreateApp(
  db: Db,
  env: Env,
  appId: string,
  attemptStatus: "pass" | "fail" | "error"
): Promise<AppRecord | null> {
  if (attemptStatus === "pass") {
    const [row] = await db
      .update(app)
      .set({ status: "ready", createAttemptId: null })
      .where(and(eq(app.id, appId), eq(app.status, "creating")))
      .returning();
    if (!row) {
      return null;
    }
    const record = toRecord(row);
    publishOrgEvent(
      { env, organizationId: record.organizationId },
      { topic: "app_list_changed", payload: { appId } }
    );
    return record;
  }
  const [row] = await db
    .update(app)
    .set({ status: "failed" })
    .where(and(eq(app.id, appId), eq(app.status, "creating")))
    .returning();
  if (!row) {
    return null;
  }
  const record = toRecord(row);
  publishOrgEvent(
    { env, organizationId: record.organizationId },
    { topic: "app_list_changed", payload: { appId } }
  );
  return record;
}

/** One-column ownership read for async publish (e.g. `runCommitAttempt`). */
export async function getAppOrganizationId(
  db: Db,
  appId: string
): Promise<string | null> {
  const row = await db.query.app.findFirst({
    where: eq(app.id, appId),
    columns: { organizationId: true },
  });
  return row?.organizationId ?? null;
}

/** Mark failed without an attempt — bootstrap/start blew up before one existed. */
export async function markCreateFailed(db: Db, appId: string): Promise<void> {
  await db
    .update(app)
    .set({ status: "failed" })
    .where(and(eq(app.id, appId), eq(app.status, "creating")));
}

/**
 * Resolve a seed attempt's real status from the AppDO.
 *
 * A callback rather than a direct stub call: `registry.ts` must not import the
 * host worker's plumbing, and the Durable Object is the authority here — D1
 * only mirrors it.
 */
export type AttemptResolver = (
  appId: string,
  attemptId: string
) => Promise<"pass" | "fail" | "error" | "pending" | "missing">;

/**
 * Reconcile `creating` rows against the AppDO, which is the authority — D1
 * only mirrors it.
 *
 * **Age is not the trigger; a terminal attempt is.** An attempt that reads
 * `pass`, `fail` or `error` is finished whatever the clock says, so a row
 * behind one can settle immediately. That is what keeps the console honest:
 * it polls this path, and it gives up long before `STALE_ATTEMPT_MS`.
 *
 * `STALE_ATTEMPT_MS` survives for the only case that cannot be asked about —
 * a row with no attempt id, where creation died before it opened one. Nothing
 * can have been seeded, but a create still in its first seconds also has no
 * id yet, so this one has to wait out the clock.
 *
 * It must **ask** rather than assume. Blindly failing would mislabel the case
 * that matters: a seed that actually passed, whose settle never ran. That app
 * is live and serving at `/a/:appId` and its attempt reads `pass`, while the
 * registry would call it `failed` forever — worse than the stuck `creating`
 * row this exists to clear.
 */
async function sweepStaleCreating(
  db: Db,
  env: Env,
  resolveAttempt: AttemptResolver
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ATTEMPT_MS);
  const creating = await db.query.app.findMany({
    where: eq(app.status, "creating"),
    columns: { id: true, createAttemptId: true, createdAt: true },
  });

  for (const row of creating) {
    if (!row.createAttemptId) {
      if (row.createdAt < cutoff) {
        await markCreateFailed(db, row.id);
      }
      continue;
    }
    const status = await resolveAttempt(row.id, row.createAttemptId);
    // Still running, or the DO has no record of it and only the clock can
    // say whether that is a lost attempt or one about to be written.
    if (
      status === "pending" ||
      (status === "missing" && row.createdAt >= cutoff)
    ) {
      continue;
    }
    await settleCreateApp(db, env, row.id, status === "pass" ? "pass" : "fail");
  }
}

export async function listAppsForOrganization(
  db: Db,
  env: Env,
  organizationId: string,
  resolveAttempt: AttemptResolver
): Promise<AppRecord[]> {
  await sweepStaleCreating(db, env, resolveAttempt);
  const rows = await db.query.app.findMany({
    where: eq(app.organizationId, organizationId),
    orderBy: [desc(app.createdAt)],
  });
  return rows.map(toRecord);
}

/**
 * Names alone, for choosing one that is not taken. Deliberately not
 * `listAppsForOrganization`: that runs the stale-`creating` sweep, and app
 * creation is not the place to pay for reconciling other apps' attempts.
 */
export async function listAppNamesForOrganization(
  db: Db,
  organizationId: string
): Promise<string[]> {
  const rows = await db
    .select({ name: app.name })
    .from(app)
    .where(eq(app.organizationId, organizationId));
  return rows.map((row) => row.name);
}

/**
 * Fetch one app by id with **no organization filter**.
 *
 * Unscoped on purpose — the name is the warning. The caller must already have
 * authorized access to this `appId` (today: `requireAppAccess` in
 * `dispatchAdmin` gate). Calling this outside that gate is a silent cross-tenant
 * read. Also runs the stale-`creating` sweep so a status poll can reconcile.
 */
export async function getAppUnscoped(
  db: Db,
  env: Env,
  appId: string,
  resolveAttempt: AttemptResolver
): Promise<AppRecord | null> {
  await sweepStaleCreating(db, env, resolveAttempt);
  const row = await db.query.app.findFirst({
    where: eq(app.id, appId),
  });
  return row ? toRecord(row) : null;
}

/**
 * Set the display name, returning the updated row or null if the id is gone.
 *
 * Unscoped by id for the same reason as `getAppUnscoped` — the caller must
 * already have cleared `requireAppAccess`.
 */
export async function renameAppUnscoped(
  db: Db,
  appId: string,
  name: string
): Promise<AppRecord | null> {
  const [row] = await db
    .update(app)
    .set({ name, updatedAt: new Date() })
    .where(eq(app.id, appId))
    .returning();
  return row ? toRecord(row) : null;
}

/**
 * Drop the registry row, returning whether one was there.
 *
 * Unscoped by id for the same reason as `getAppUnscoped`, and named the same
 * way so misuse stays greppable: the caller must already have cleared
 * `requireAppAccess`. Runs no stale sweep — the row is about to be gone, so
 * reconciling its status first would be work whose only output is discarded.
 */
export async function deleteAppUnscoped(
  db: Db,
  appId: string
): Promise<boolean> {
  const removed = await db
    .delete(app)
    .where(eq(app.id, appId))
    .returning({ id: app.id });
  return removed.length > 0;
}
