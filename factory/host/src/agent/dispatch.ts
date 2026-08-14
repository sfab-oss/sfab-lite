import { routeAgentRequest } from "agents";
import { createDb } from "../db/index.js";
import { requireAppAccess, resolveActor } from "../hono/tenancy.js";
import { getWorkspaceAppId } from "../registry/workspace-registry.js";
import type { RequestCtx } from "../serve/routes.js";

/**
 * `/agents/app-agent/<workspaceId>[/sub/app-thread/<threadId>][/…]` only.
 * Auth + tenancy run *before* `routeAgentRequest`: that helper enumerates
 * every DO binding with `idFromName` (including `APP_DATA_DO` /
 * `APP_CREATE_DO`), so an ungated branch is a standing gateway to every
 * namespace this Worker will ever bind. Facet gating (`onBeforeSubAgent`) is a
 * second check inside AppAgent — not a replacement for this tenancy gate.
 */
const RE_APP_AGENT = /^\/agents\/app-agent\/([^/]+)(?:\/.*)?$/;

function jsonError(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

export async function dispatchAgents(rc: RequestCtx): Promise<Response> {
  const db = createDb(rc.env);
  const actor = await resolveActor(rc.env, db, rc.request, rc.url.origin);
  if (actor instanceof Response) {
    return actor;
  }

  const match = rc.url.pathname.match(RE_APP_AGENT);
  if (!match?.[1]) {
    return jsonError("agent_not_found", 404);
  }

  // The raw segment, undecoded: routePartykitRequest passes it to
  // idFromName verbatim, so decoding here would authorize one identity and
  // instantiate another.
  const workspaceId = match[1];
  if (!workspaceId.startsWith("ws_")) {
    return jsonError("agent_not_found", 404);
  }

  const appId = await getWorkspaceAppId(db, workspaceId);
  if (!appId) {
    return jsonError("agent_not_found", 404);
  }

  const denied = await requireAppAccess(db, actor, appId);
  if (denied) {
    return denied;
  }

  return (
    (await routeAgentRequest(rc.request, rc.env)) ??
    jsonError("agent_not_found", 404)
  );
}
