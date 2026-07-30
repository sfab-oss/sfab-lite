/**
 * Host-side create reconcile: sweep stale `creating` rows, then publish org
 * events. Registry stays data-only; this module owns Env / AppCreateDO / the bus.
 *
 * Does not publish `app_live_changed` — that topic is owned solely by
 * `runCdForSha` when the live pointer moves.
 */
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
      { topic: "app_record_changed", payload: { appId } }
    );
  }
}
