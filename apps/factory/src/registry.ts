/**
 * App registry — the D1 index that makes apps enumerable.
 *
 * Durable Objects cannot be listed (`idFromName` is a hash), so every created
 * app must land a row here before its AppDO is seeded. Create/list take an
 * `organizationId` from the dispatcher (`OrgCtx`); app-scoped reads
 * (`getAppUnscoped`) are by id alone after `requireAppAccess`.
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
 * Reconcile `creating` rows older than `STALE_ATTEMPT_MS` against the AppDO.
 *
 * Same trigger as `AppDO.#sweepStaleAttempts` — a dropped `waitUntil` between
 * the D1 insert and a terminal status — and the same constant, so the two
 * backstops cannot disagree about what "dead" means.
 *
 * It must **ask** rather than assume. Blindly failing every stale row would
 * mislabel the one case that matters: a seed that actually passed, whose
 * settle never ran. That app is live and serving at `/a/:appId` and its
 * attempt reads `pass`, while the registry would call it `failed` forever —
 * a worse outcome than the stuck `creating` row this sweep exists to clear.
 */
async function sweepStaleCreating(
  db: Db,
  resolveAttempt: AttemptResolver
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ATTEMPT_MS);
  const stale = await db.query.app.findMany({
    where: and(eq(app.status, "creating"), lt(app.createdAt, cutoff)),
    columns: { id: true, createAttemptId: true },
  });

  for (const row of stale) {
    // No attempt id means creation died before it ever opened one. Nothing to
    // ask, and nothing can have been seeded — unambiguously failed.
    if (!row.createAttemptId) {
      await markCreateFailed(db, row.id);
      continue;
    }
    // The AppDO is the authority on whether the seed passed; D1 only mirrors
    // it. `pending` cannot survive here — the DO's own sweep uses the same
    // ceiling and will already have moved it to `error`.
    const status = await resolveAttempt(row.id, row.createAttemptId);
    await settleCreateApp(db, row.id, status === "pass" ? "pass" : "fail");
  }
}

export async function listAppsForOrganization(
  db: Db,
  organizationId: string,
  resolveAttempt: AttemptResolver
): Promise<AppRecord[]> {
  await sweepStaleCreating(db, resolveAttempt);
  const rows = await db.query.app.findMany({
    where: eq(app.organizationId, organizationId),
    orderBy: [desc(app.createdAt)],
  });
  return rows.map(toRecord);
}

/**
 * Fetch one app by id with **no organization filter**.
 *
 * Unscoped on purpose — the name is the warning. The caller must already have
 * authorized access to this `appId` (today: `requireAppAccess` in
 * `dispatchAdmin`). Calling this outside that gate is a silent cross-tenant
 * read. Also runs the stale-`creating` sweep so a status poll can reconcile.
 */
export async function getAppUnscoped(
  db: Db,
  appId: string,
  resolveAttempt: AttemptResolver
): Promise<AppRecord | null> {
  await sweepStaleCreating(db, resolveAttempt);
  const row = await db.query.app.findFirst({
    where: eq(app.id, appId),
  });
  return row ? toRecord(row) : null;
}
