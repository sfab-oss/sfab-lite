/**
 * Ephemeral workspace WIP compile — compileAll only, stored under a fixed R2
 * key (not sha-immutable CD builds). Migrations are snapshotted with the build
 * so serve bootstraps the same generation it serves.
 */

import { compileAll } from "../compile/compile-all.js";
import type { AppBuild } from "../storage/build-store.js";
import type { AppMigration } from "./app-migrations.js";

const WORKSPACE_BUILD_SHA_PREFIX = "ws:";

export interface WorkspaceBuildRecord {
  generation: number;
  build: AppBuild;
  migrations: AppMigration[];
  at: number;
}

function workspaceBuildKey(appId: string): string {
  return `builds/${appId}/workspace.json`;
}

export async function compileWorkspaceFiles(
  files: Record<string, string>
): Promise<Omit<AppBuild, "sha">> {
  const { compiled, assets } = await compileAll(files);
  return {
    serverBundle: compiled.serverBundle,
    assets,
    kernelVersion: compiled.kernelVersion,
    serverSurfaceHash: compiled.serverSurfaceHash,
  };
}

export function workspaceBuildSha(generation: number): string {
  return `${WORKSPACE_BUILD_SHA_PREFIX}${generation}`;
}

export async function putWorkspaceBuild(
  env: Env,
  appId: string,
  record: WorkspaceBuildRecord
): Promise<void> {
  await env.CODE_R2.put(workspaceBuildKey(appId), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json" },
  });
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
  appId: string
): Promise<WorkspaceBuildRecord | null> {
  const obj = await env.CODE_R2.get(workspaceBuildKey(appId));
  if (!obj) {
    return null;
  }
  const parsed: unknown = await obj.json();
  if (!isWorkspaceBuildRecord(parsed)) {
    return null;
  }
  return parsed;
}
