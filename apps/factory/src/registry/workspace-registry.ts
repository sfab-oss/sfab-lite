/**
 * Workspace registry — isolated agent runtimes per app.
 *
 * `id` is a server-generated ULID (`ws_…`) and is the AppAgent Durable Object
 * name. One row with `isDefault` is created with every app.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { workspace } from "../db/schema.js";

export interface WorkspaceRecord {
  id: string;
  appId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
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
