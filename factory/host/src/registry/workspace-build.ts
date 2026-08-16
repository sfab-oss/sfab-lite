/**
 * Ephemeral workspace WIP compile — build() only, stored under a fixed R2
 * key (not sha-immutable CD builds). Migrations are snapshotted with the build
 * so serve bootstraps the same generation it serves.
 */

import { build } from "@sfab-lite/verbs/build";
import { type OverlaidTree, overlayFormatFiles } from "@sfab-lite/verbs/format";
import { appBuildFromCompile } from "../code-host/app-image.js";
import type { AppBuild } from "../code-host/build-store.js";
import { parseStoredBuild } from "../code-host/build-store.js";
import type { AppMigration } from "./app-migrations.js";

const WORKSPACE_BUILD_SHA_PREFIX = "ws:";

export interface WorkspaceBuildRecord {
  generation: number;
  build: AppBuild;
  migrations: AppMigration[];
  at: number;
}

function workspaceBuildKey(workspaceId: string): string {
  return `builds/${workspaceId}/workspace.json`;
}

export async function compileWorkspaceFiles(
  files: Record<string, string>,
  sha: string
): Promise<{ build: AppBuild; tree: OverlaidTree }> {
  const tree = overlayFormatFiles(files);
  const compiled = await build(tree);
  return { build: appBuildFromCompile(sha, tree, compiled), tree };
}

export function workspaceBuildSha(generation: number): string {
  return `${WORKSPACE_BUILD_SHA_PREFIX}${generation}`;
}

export async function putWorkspaceBuild(
  env: Env,
  workspaceId: string,
  record: WorkspaceBuildRecord
): Promise<void> {
  await env.CODE_R2.put(
    workspaceBuildKey(workspaceId),
    JSON.stringify(record),
    {
      httpMetadata: { contentType: "application/json" },
    }
  );
}

function isWorkspaceBuildRecord(value: unknown): value is WorkspaceBuildRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.generation === "number" &&
    record.build != null &&
    typeof record.build === "object" &&
    Array.isArray(record.migrations) &&
    typeof record.at === "number"
  );
}

export async function getWorkspaceBuild(
  env: Env,
  workspaceId: string
): Promise<WorkspaceBuildRecord | null> {
  const obj = await env.CODE_R2.get(workspaceBuildKey(workspaceId));
  if (!obj) {
    return null;
  }
  const parsed: unknown = await obj.json();
  if (!isWorkspaceBuildRecord(parsed)) {
    return null;
  }
  const build = parseStoredBuild(parsed.build);
  if (!build) {
    return null;
  }
  return { ...parsed, build };
}

export async function deleteWorkspaceBuild(
  env: Env,
  workspaceId: string
): Promise<void> {
  await env.CODE_R2.delete(workspaceBuildKey(workspaceId));
}
