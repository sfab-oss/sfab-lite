import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type OrgEventsRouterDeps,
  routeOrgEvent,
} from "./features/org-events/org-events-router-core.ts";
import type { OrgEventWire } from "./org-events.ts";

function frame(
  topic: string,
  payload: Record<string, unknown>,
  seq = 1
): OrgEventWire {
  return {
    v: 1,
    kind: "event",
    seq,
    id: `evt_${seq}`,
    topic,
    payload,
  };
}

function captureDeps() {
  const calls: string[] = [];
  const deps: OrgEventsRouterDeps = {
    coalesce: (run) => run(),
    invalidateApps: () => calls.push("apps"),
    invalidateApp: (appId) => calls.push(`app:${appId}`),
    invalidateVersions: (appId) => calls.push(`versions:${appId}`),
    refreshAttendedApp: (appId) => calls.push(`refresh:${appId}`),
    onLiveVersion: (appId, liveVersionId) =>
      calls.push(`live:${appId}:${liveVersionId}`),
  };
  return { calls, deps };
}

describe("routeOrgEvent", () => {
  it("invalidates apps list on app_list_changed", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(frame("app_list_changed", { appId: "app_1" }), deps);
    assert.deepEqual(calls, ["apps"]);
  });

  it("invalidates app + list on app_record_changed", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(frame("app_record_changed", { appId: "app_1" }), deps);
    assert.deepEqual(calls, ["app:app_1", "apps"]);
  });

  it("reloads preview on app_live_version_changed", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(
      frame("app_live_version_changed", {
        appId: "app_1",
        liveVersionId: "v_9",
      }),
      deps
    );
    assert.deepEqual(calls, [
      "versions:app_1",
      "refresh:app_1",
      "live:app_1:v_9",
    ]);
  });

  it("ignores live events missing ids", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(frame("app_live_version_changed", { appId: "app_1" }), deps);
    assert.deepEqual(calls, []);
  });
});
