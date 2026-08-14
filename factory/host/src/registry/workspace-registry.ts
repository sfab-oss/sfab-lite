/**
 * Workspace registry — isolated agent runtimes per app.
 *
 * `id` is a server-generated ULID (`ws_…`) and is the AppAgent Durable Object
 * name. One row with `isDefault` is created with every app.
 */
import { and, asc, count, eq } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import type { Db } from "../db/index.js";
import { workspace } from "../db/schema.js";

const nextWorkspaceUlid = monotonicFactory();

export const WORKSPACE_NAME_MAX_LENGTH = 64;

export interface WorkspaceRecord {
  id: string;
  appId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function newWorkspaceId(): string {
  return `ws_${nextWorkspaceUlid()}`;
}

function toRecord(row: typeof workspace.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    appId: row.appId,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listWorkspacesForApp(
  db: Db,
  appId: string
): Promise<WorkspaceRecord[]> {
  const rows = await db.query.workspace.findMany({
    where: eq(workspace.appId, appId),
    orderBy: [asc(workspace.createdAt)],
  });
  return rows.map(toRecord);
}

export async function countWorkspacesForApp(
  db: Db,
  appId: string
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workspace)
    .where(eq(workspace.appId, appId));
  return row?.n ?? 0;
}

export async function getWorkspaceUnscoped(
  db: Db,
  workspaceId: string
): Promise<WorkspaceRecord | null> {
  const row = await db.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
  });
  return row ? toRecord(row) : null;
}

export async function getDefaultWorkspaceForApp(
  db: Db,
  appId: string
): Promise<WorkspaceRecord | null> {
  const row = await db.query.workspace.findFirst({
    where: and(eq(workspace.appId, appId), eq(workspace.isDefault, true)),
  });
  return row ? toRecord(row) : null;
}

export async function getWorkspaceAppId(
  db: Db,
  workspaceId: string
): Promise<string | null> {
  const row = await db.query.workspace.findFirst({
    where: eq(workspace.id, workspaceId),
    columns: { appId: true },
  });
  return row?.appId ?? null;
}

export async function workspaceBelongsToApp(
  db: Db,
  appId: string,
  workspaceId: string
): Promise<boolean> {
  const row = await db.query.workspace.findFirst({
    where: and(eq(workspace.id, workspaceId), eq(workspace.appId, appId)),
    columns: { id: true },
  });
  return Boolean(row);
}

/** Insert a non-default workspace. Caller seeds the AppAgent DO. */
export async function createWorkspaceForApp(
  db: Db,
  input: { appId: string; name: string }
): Promise<WorkspaceRecord> {
  const now = new Date();
  const [row] = await db
    .insert(workspace)
    .values({
      id: newWorkspaceId(),
      appId: input.appId,
      name: input.name,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) {
    throw new Error("createWorkspaceForApp: insert returned no row");
  }
  return toRecord(row);
}

export async function renameWorkspaceForApp(
  db: Db,
  appId: string,
  workspaceId: string,
  name: string
): Promise<WorkspaceRecord | null> {
  const [row] = await db
    .update(workspace)
    .set({ name })
    .where(and(eq(workspace.id, workspaceId), eq(workspace.appId, appId)))
    .returning();
  return row ? toRecord(row) : null;
}

/**
 * Flip default in one D1 batch — clear the previous default, then set the
 * target. Exactly one default remains when the target belongs to the app.
 */
export async function setDefaultWorkspaceForApp(
  db: Db,
  appId: string,
  workspaceId: string
): Promise<WorkspaceRecord | null> {
  const target = await db.query.workspace.findFirst({
    where: and(eq(workspace.id, workspaceId), eq(workspace.appId, appId)),
  });
  if (!target) {
    return null;
  }
  if (target.isDefault) {
    return toRecord(target);
  }
  const now = new Date();
  const [, updatedRows] = await db.batch([
    db
      .update(workspace)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(workspace.appId, appId), eq(workspace.isDefault, true))),
    db
      .update(workspace)
      .set({ isDefault: true, updatedAt: now })
      .where(and(eq(workspace.id, workspaceId), eq(workspace.appId, appId)))
      .returning(),
  ]);
  const row = updatedRows[0];
  return row ? toRecord(row) : null;
}

export async function deleteWorkspaceForApp(
  db: Db,
  appId: string,
  workspaceId: string
): Promise<boolean> {
  const result = await db
    .delete(workspace)
    .where(and(eq(workspace.id, workspaceId), eq(workspace.appId, appId)))
    .returning({ id: workspace.id });
  return result.length > 0;
}
