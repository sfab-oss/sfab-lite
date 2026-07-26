import { routeAgentRequest } from "agents";
import { createDb } from "../db/index.js";
import type { RequestCtx } from "../routes.js";
import { requireAppAccess, resolveActor } from "../tenancy.js";
import { parseThreadName } from "./seed-workspace.js";

/**
 * `/agents/app-thread/<appId:threadId>[/…]` only. Auth + tenancy run *before*
 * `routeAgentRequest`: that helper enumerates every DO binding with
 * `idFromName` (including `APP_DO` → `app-do`), so an ungated branch is a
 * standing gateway to every namespace this Worker will ever bind.
 */
const RE_APP_THREAD = /^\/agents\/app-thread\/([^/]+)(?:\/.*)?$/;

function jsonError(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

export async function dispatchAgents(rc: RequestCtx): Promise<Response> {
  const db = createDb(rc.env);
  const actor = await resolveActor(rc.env, db, rc.request, rc.url.origin);
  if (actor instanceof Response) {
    return actor;
  }

  const match = rc.url.pathname.match(RE_APP_THREAD);
  if (!match?.[1]) {
    return jsonError("agent_not_found", 404);
  }

  let appId: string;
  try {
    ({ appId } = parseThreadName(decodeURIComponent(match[1])));
  } catch {
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
