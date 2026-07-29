/**
 * Host-side create reconcile: sweep stale `creating` rows, then publish org
 * events. Registry stays data-only; this module owns Env / AppDO / the bus.
 */
import { getLiveSha } from "./cd.js";
import type { Db } from "./db/index.js";
import { publishOrgEvent } from "./org-events.js";
import { type AttemptResolver, sweepStaleCreating } from "./registry.js";

export async function reconcileCreatingApps(
  env: Env,
  db: Db,
  resolveAttempt: AttemptResolver
): Promise<void> {
  const actions = await sweepStaleCreating(db, resolveAttempt);
  for (const action of actions) {
    const { appId, organizationId } = action;
    publishOrgEvent(
      { env, organizationId },
      { topic: "app_list_changed", payload: { appId } }
    );
    if (action.kind !== "pass") {
      continue;
    }
    const liveSha = await getLiveSha(env, appId).catch(() => null);
    if (!liveSha) {
      continue;
    }
    publishOrgEvent(
      { env, organizationId },
      {
        topic: "app_live_changed",
        payload: { appId, liveSha },
      }
    );
  }
}
