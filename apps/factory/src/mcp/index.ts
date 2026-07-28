import { createMcpHandler } from "agents/mcp";
import type { RequestCtx } from "../routes.js";
import { buildMcpServer } from "./lib/build-server.js";
import { authorizeMcp } from "./lib/gate.js";

/**
 * `/mcp` — the factory's tools with no model in the loop, so the create →
 * edit → check → deploy loop can be driven (and tested) directly.
 *
 * Auth is the shared `ADMIN_TOKEN` rather than the platform's OAuth: every
 * operation here is one the `/admin/*` API already grants that same token —
 * `workspace_write` plus `app_deploy` is what `POST /admin/apps/:id/commit`
 * does — so this is a second door onto existing privilege, not a new one.
 */
export async function dispatchMcp(rc: RequestCtx): Promise<Response> {
  const authorized = authorizeMcp(rc.request, rc.url, rc.env.ADMIN_TOKEN);
  if (authorized instanceof Response) {
    return authorized;
  }
  const server = buildMcpServer({
    env: rc.env,
    organizationId: authorized.organizationId,
  });
  return await createMcpHandler(server)(rc.request, rc.env, rc.ctx);
}
