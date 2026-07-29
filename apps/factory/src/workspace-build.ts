/**
 * Ephemeral workspace WIP compile — compileAll only, stored under a fixed R2
 * key (not sha-immutable CD builds).
 */
import type { AppBuild } from "./build-store.js";
import { buildIndexHtml, compileClient } from "./compile-client.js";
import { compileCss } from "./compile-css.js";
import { compileServer } from "./compile-server.js";

const WORKSPACE_BUILD_SHA_PREFIX = "ws:";

export interface WorkspaceBuildRecord {
  generation: number;
  build: AppBuild;
  at: number;
}

function workspaceBuildKey(appId: string): string {
  return `builds/${appId}/workspace.json`;
}

export async function compileWorkspaceFiles(
  files: Record<string, string>
): Promise<Omit<AppBuild, "sha">> {
  const compiled = await compileServer(files);
  const client = await compileClient(files);
  const css = await compileCss(files);
  return {
    serverBundle: compiled.serverBundle,
    assets: {
      "index.html": buildIndexHtml({
        kernelVersion: compiled.kernelVersion,
      }),
      "assets/app.js": client.js,
      "assets/app.css": css.css,
    },
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

export async function getWorkspaceBuild(
  env: Env,
  appId: string
): Promise<WorkspaceBuildRecord | null> {
  const obj = await env.CODE_R2.get(workspaceBuildKey(appId));
  if (!obj) {
    return null;
  }
  return (await obj.json()) as WorkspaceBuildRecord;
}
