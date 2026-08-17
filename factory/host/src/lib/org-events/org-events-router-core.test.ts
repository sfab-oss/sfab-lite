import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrgEventInput, OrgEventWire } from "../../org-events.ts";
import {
  type OrgEventsRouterDeps,
  routeOrgEvent,
} from "./org-events-router-core.ts";

function frame(
  topic: OrgEventInput["topic"],
  payload: { appId?: string; liveSha?: string },
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
    onLive: (appId, liveSha) => calls.push(`live:${appId}:${liveSha}`),
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

  it("reloads preview on app_live_changed", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(
      frame("app_live_changed", {
        appId: "app_1",
        liveSha: "abc123",
      }),
      deps
    );
    assert.deepEqual(calls, [
      "versions:app_1",
      "refresh:app_1",
      "live:app_1:abc123",
    ]);
  });

  it("ignores live events missing ids", () => {
    const { calls, deps } = captureDeps();
    routeOrgEvent(frame("app_live_changed", { appId: "app_1" }), deps);
    assert.deepEqual(calls, []);
  });
});
