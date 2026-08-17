import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  newOrgEventId,
  orgServerFrameSchema,
  packOrgEvent,
} from "./org-events.ts";

const EVENT_ID = /^evt_[0-9A-HJKMNP-TV-Z]{26}$/i;

describe("packOrgEvent", () => {
  it("stamps wire frame without putting org on the payload", () => {
    const frame = packOrgEvent(
      {
        topic: "app_live_changed",
        payload: { appId: "app_1", liveSha: "abc123" },
      },
      42,
      "evt_test"
    );
    assert.deepEqual(frame, {
      v: 1,
      kind: "event",
      seq: 42,
      id: "evt_test",
      topic: "app_live_changed",
      payload: { appId: "app_1", liveSha: "abc123" },
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

describe("orgServerFrameSchema", () => {
  it("accepts sync, resync, and event frames", () => {
    assert.equal(
      orgServerFrameSchema.safeParse({ v: 1, kind: "sync", seq: 3 }).success,
      true
    );
    assert.equal(
      orgServerFrameSchema.safeParse({
        v: 1,
        kind: "resync",
        fromSeq: 1,
        toSeq: 3,
      }).success,
      true
    );
    assert.equal(
      orgServerFrameSchema.safeParse({
        v: 1,
        kind: "event",
        seq: 1,
        id: "evt_a",
        topic: "app_list_changed",
        payload: {},
      }).success,
      true
    );
  });

  it("rejects a missing v or unknown kind", () => {
    assert.equal(
      orgServerFrameSchema.safeParse({ kind: "sync", seq: 1 }).success,
      false
    );
    assert.equal(
      orgServerFrameSchema.safeParse({ v: 1, kind: "resume", lastSeq: 1 })
        .success,
      false
    );
  });
});
