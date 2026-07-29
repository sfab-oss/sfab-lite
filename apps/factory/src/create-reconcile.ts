/**
 * Host-side create reconcile: sweep stale `creating` rows, then publish org
 * events. Registry stays data-only; this module owns Env / AppDO / the bus.
 */
import { appStub } from "./commit.js";
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
    const live = await appStub(env, appId)
      .getLive()
      .catch(() => null);
    if (!live?.liveVersionId) {
      continue;
    }
    publishOrgEvent(
      { env, organizationId },
      {
        topic: "app_live_version_changed",
        payload: { appId, liveVersionId: live.liveVersionId },
      }
    );
  }
}
