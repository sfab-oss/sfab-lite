import assert from "node:assert/strict";
import { test } from "node:test";
import { liveDataId, prDataId, wsDataId } from "./app-data-ids.ts";

test("wsDataId defaults to the default slot", () => {
  assert.equal(wsDataId("app_1"), "app_1:ws:default");
  assert.equal(wsDataId("app_1", "board"), "app_1:ws:board");
  assert.notEqual(wsDataId("app_1"), liveDataId("app_1"));
  assert.notEqual(wsDataId("app_1"), prDataId("app_1", 3));
});
