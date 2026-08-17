import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidRequestError,
  isStringRecord,
  parseAppIdField,
  parseFilesField,
  requestFields,
} from "./request.ts";

function assertInvalid(fn: () => unknown, field: string, message: string) {
  try {
    fn();
    assert.fail("expected InvalidRequestError");
  } catch (e) {
    assert.ok(e instanceof InvalidRequestError);
    assert.equal(e.field, field);
    assert.equal(e.message, message);
  }
}

test("parseFilesField and parseAppIdField keep the HTTP 400 strings", () => {
  assert.deepEqual(parseFilesField({ "src/a.ts": "export {}" }), {
    "src/a.ts": "export {}",
  });
  assert.equal(parseAppIdField("app_1"), "app_1");
  assertInvalid(
    () => parseFilesField(undefined),
    "files",
    "body.files (path→content) required"
  );
  assertInvalid(
    () => parseFilesField({ "src/a.ts": 1 }),
    "files",
    "body.files (path→content) required"
  );
  assertInvalid(() => parseAppIdField(""), "appId", "body.appId required");
  assertInvalid(() => parseAppIdField(1), "appId", "body.appId required");
});

test("requestFields treats a non-object body as empty so field checks fire", () => {
  assert.deepEqual(requestFields(null), {});
  assert.deepEqual(requestFields([]), {});
  assert.equal(isStringRecord({ a: "b" }), true);
  assert.equal(isStringRecord({ a: 1 }), false);
  assert.equal(isStringRecord(["a"]), false);
});
