/**
 * App registry — the D1 index that makes apps enumerable.
 *
 * Durable Objects cannot be listed (`idFromName` is a hash), so every created
 * app must land a row here before its AppDO is seeded. Callers pass
 * `organizationId` explicitly today; the swap point for session-backed
 * tenancy is the handlers in `index.ts` that read that id from the request
 * (body / query) — replace those reads with `session.activeOrganizationId`
 * and leave every function in this module unchanged.
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import { STALE_ATTEMPT_MS } from "./app-do.js";
import type { Db } from "./db/index.js";
import { app, organization } from "./db/schema.js";

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
  appId: string,
  attemptStatus: "pass" | "fail" | "error"
): Promise<AppRecord | null> {
  if (attemptStatus === "pass") {
    const [row] = await db
      .update(app)
      .set({ status: "ready", createAttemptId: null })
      .where(and(eq(app.id, appId), eq(app.status, "creating")))
      .returning();
    return row ? toRecord(row) : null;
  }
  const [row] = await db
    .update(app)
    .set({ status: "failed" })
    .where(and(eq(app.id, appId), eq(app.status, "creating")))
    .returning();
  return row ? toRecord(row) : null;
}

/** Mark failed without an attempt — bootstrap/start blew up before one existed. */
export async function markCreateFailed(db: Db, appId: string): Promise<void> {
  await db
    .update(app)
    .set({ status: "failed" })
    .where(and(eq(app.id, appId), eq(app.status, "creating")));
}

/**
 * Sweep `creating` rows older than `STALE_ATTEMPT_MS`.
 *
 * Same reasoning as `AppDO.#sweepStaleAttempts`: a crash between the D1
 * insert and a terminal attempt status would otherwise leave the row stuck
 * forever. Same constant so the two backstops cannot disagree about "dead".
 */
async function sweepStaleCreating(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ATTEMPT_MS);
  await db
    .update(app)
    .set({ status: "failed" })
    .where(and(eq(app.status, "creating"), lt(app.createdAt, cutoff)));
}

export async function listAppsForOrganization(
  db: Db,
  organizationId: string
): Promise<AppRecord[]> {
  await sweepStaleCreating(db);
  const rows = await db.query.app.findMany({
    where: eq(app.organizationId, organizationId),
    orderBy: [desc(app.createdAt)],
  });
  return rows.map(toRecord);
}

/**
 * Fetch one app **within an organization**.
 *
 * Scoped deliberately. Looking up by id alone would return any tenant's row
 * to anyone holding an id, and since `organizationId` is designed to become
 * `session.activeOrganizationId` in a one-line change, an unscoped lookup
 * would turn into a cross-tenant read the moment auth lands — silently, with
 * no diff to notice. Absent and not-yours are the same answer here.
 */
export async function getApp(
  db: Db,
  organizationId: string,
  appId: string
): Promise<AppRecord | null> {
  await sweepStaleCreating(db);
  const row = await db.query.app.findFirst({
    where: and(eq(app.id, appId), eq(app.organizationId, organizationId)),
  });
  return row ? toRecord(row) : null;
}
