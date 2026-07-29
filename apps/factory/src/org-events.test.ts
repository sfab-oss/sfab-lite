import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newOrgEventId, packOrgEvent } from "./org-events.ts";

const EVENT_ID = /^evt_[0-9A-HJKMNP-TV-Z]{26}$/i;

describe("packOrgEvent", () => {
  it("stamps wire frame without putting org on the payload", () => {
    const frame = packOrgEvent(
      {
        topic: "app_live_version_changed",
        payload: { appId: "app_1", liveVersionId: "v_1" },
      },
      42,
      "evt_test"
    );
    assert.deepEqual(frame, {
      v: 1,
      kind: "event",
      seq: 42,
      id: "evt_test",
      topic: "app_live_version_changed",
      payload: { appId: "app_1", liveVersionId: "v_1" },
    });
  });

  it("defaults list payload to empty object", () => {
    const frame = packOrgEvent({ topic: "app_list_changed" }, 1, "evt_a");
    assert.equal(frame.topic, "app_list_changed");
    assert.deepEqual(frame.payload, {});
  });
});

describe("newOrgEventId", () => {
  it("prefixes ULID with evt_", () => {
    const id = newOrgEventId();
    assert.match(id, EVENT_ID);
  });
});
