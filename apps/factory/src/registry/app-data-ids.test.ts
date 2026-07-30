import assert from "node:assert/strict";
import { test } from "node:test";
import { liveDataId, prDataId, wsDataId } from "./app-data-ids.ts";

test("wsDataId is keyed by workspace id", () => {
  assert.equal(wsDataId("ws_1"), "ws_1:ws");
  assert.notEqual(wsDataId("ws_1"), liveDataId("app_1"));
  assert.notEqual(wsDataId("ws_1"), prDataId("app_1", 3));
});
