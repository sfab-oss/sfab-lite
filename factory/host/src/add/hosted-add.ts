import catalogJson from "@sfab-lite/registry/catalog" with { type: "json" };
import { type Catalog, resolveAdd } from "@sfab-lite/registry/lite";
import { getAgentByName } from "agents";
import { createDb } from "../db/index.js";
import {
  getDefaultWorkspaceForApp,
  getWorkspaceUnscoped,
  workspaceBelongsToApp,
} from "../registry/workspace-registry.js";
import { applyAdd } from "./apply-add.js";

const CATALOG = catalogJson as Catalog;

async function workspaceAgent(env: Env, appId: string, workspaceId?: string) {
  const db = createDb(env);
  if (workspaceId) {
    const belongs = await workspaceBelongsToApp(db, appId, workspaceId);
    if (!belongs) {
      throw new Error(
        `Workspace ${workspaceId} does not belong to app ${appId}`
      );
    }
    const workspace = await getWorkspaceUnscoped(db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return getAgentByName(env.AppAgent, workspace.id);
  }
  const workspace = await getDefaultWorkspaceForApp(db, appId);
  if (!workspace) {
    throw new Error(`No default workspace for app ${appId}`);
  }
  return getAgentByName(env.AppAgent, workspace.id);
}

function abs(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Hosted `add` against a think-workspace. Reads the planned targets,
 * applies the pure planner, writes copies + `manifest.json`.
 */
export async function addRecipeToWorkspace(
  env: Env,
  appId: string,
  name: string,
  workspaceId?: string
) {
  const resolved = resolveAdd(name, CATALOG);
  const agent = await workspaceAgent(env, appId, workspaceId);
  const existing: Record<string, string | null> = {
    "manifest.json": await agent.readFile("/manifest.json"),
  };
  if (resolved.ok) {
    for (const entry of resolved.entries) {
      for (const file of entry.item.files) {
        existing[file.target] = await agent.readFile(abs(file.target));
      }
    }
  }
  const result = applyAdd(name, existing);
  if (!result.ok) {
    return result;
  }
  for (const [path, content] of Object.entries(result.files)) {
    await agent.writeFile(abs(path), content);
  }
  return result;
}
