import { getAgentByName } from "agents";
import { createDb } from "../../db/index.js";
import {
  getDefaultWorkspaceForApp,
  getWorkspaceUnscoped,
  workspaceBelongsToApp,
} from "../../registry/workspace-registry.js";

/** Where the loopback lands. Never leaves the Worker. */
const LOOPBACK_ORIGIN = "https://sfab-lite.internal";

export interface McpContext {
  env: Env;
  /** Scopes every `organization`-scoped protected route. */
  organizationId: string;
}

/**
 * Call the factory's own `/api/protected/*` API.
 *
 * The protected handlers own tenancy, validation and the create/commit
 * choreography already; reaching them over the loopback rather than
 * re-implementing them is what stops the MCP surface from drifting into a
 * second, subtly different factory API. Same pattern as `internal.ts`, minus
 * the derived token — this caller has `ADMIN_TOKEN` itself.
 */
export async function protectedFetch(
  ctx: McpContext,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const token = ctx.env.ADMIN_TOKEN;
  if (!token) {
    throw new Error("ADMIN_TOKEN is not configured on this factory");
  }
  const headers: Record<string, string> = { "X-Admin-Token": token };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await ctx.env.SELF.fetch(
    new Request(`${LOOPBACK_ORIGIN}${path}`, init)
  );
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** `?organizationId=` is how token actors scope an org-scoped protected route. */
export function orgQuery(ctx: McpContext): string {
  return `?organizationId=${encodeURIComponent(ctx.organizationId)}`;
}

/**
 * An AppAgent stub whose `onStart` has already run.
 *
 * MCP tools take `appId` and optional `workspaceId`. Omit workspaceId → the
 * app's default workspace. Provide → that computer after a belonging check.
 * `getAgentByName` rather than `idFromName`: a native RPC call does not pass
 * through `Server.fetch()`, which is where partyserver would otherwise
 * initialize the object. Reaching an uninitialized AppAgent gets an unseeded
 * workspace and an unresolved `this.name` — so `readDir("/")` answers `[]` for
 * an app whose files are perfectly intact, and `runShell` builds its commands
 * for an undefined appId. The console never hit this because a websocket
 * connect goes through fetch.
 */
export async function appAgent(env: Env, appId: string, workspaceId?: string) {
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
