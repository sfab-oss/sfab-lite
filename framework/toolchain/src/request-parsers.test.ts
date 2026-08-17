import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  appIdSchema,
  filesSchema,
  InvalidRequestError,
  parseRequest,
  rejectUnlessAdmin,
} from "./request.ts";

const probe = z.object({
  files: filesSchema,
  appId: appIdSchema,
});

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

test("parseRequest keeps the HTTP 400 strings for files and appId", () => {
  assert.deepEqual(
    parseRequest(probe, {
      files: { "src/a.ts": "export {}" },
      appId: "app_1",
    }),
    { files: { "src/a.ts": "export {}" }, appId: "app_1" }
  );
  assertInvalid(
    () => parseRequest(probe, { appId: "app_1" }),
    "files",
    "body.files (path→content) required"
  );
  assertInvalid(
    () => parseRequest(probe, { files: { "src/a.ts": 1 }, appId: "app_1" }),
    "files",
    "body.files (path→content) required"
  );
  assertInvalid(
    () =>
      parseRequest(probe, { files: { "src/a.ts": "export {}" }, appId: "" }),
    "appId",
    "body.appId required"
  );
  assertInvalid(
    () => parseRequest(probe, { files: { "src/a.ts": "export {}" }, appId: 1 }),
    "appId",
    "body.appId required"
  );
});

test("parseRequest treats a non-object body as empty so field checks fire", () => {
  assertInvalid(
    () => parseRequest(probe, null),
    "files",
    "body.files (path→content) required"
  );
  assertInvalid(
    () => parseRequest(probe, []),
    "files",
    "body.files (path→content) required"
  );
});

test("rejectUnlessAdmin denies a missing token and a mismatch", async () => {
  const req = new Request("https://example.test/check");
  const denied = rejectUnlessAdmin(req, {});
  assert.equal(denied?.status, 401);
  assert.deepEqual(await denied?.json(), { ok: false, error: "unauthorized" });

  const mismatch = rejectUnlessAdmin(req, { ADMIN_TOKEN: "secret" });
  assert.equal(mismatch?.status, 401);

  const ok = rejectUnlessAdmin(
    new Request("https://example.test/check", {
      headers: { "X-Admin-Token": "secret" },
    }),
    { ADMIN_TOKEN: "secret" }
  );
  assert.equal(ok, null);
});
