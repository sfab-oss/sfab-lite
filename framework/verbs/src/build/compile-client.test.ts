import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLIENT_IMPORT_MAP,
  CLIENT_KERNEL_FILES,
} from "@sfab-lite/kernel";

test("kernel serves zod/v4/core for hookform resolvers", () => {
  assert.equal(CLIENT_IMPORT_MAP["zod/v4/core"], "./zod-v4-core.js");
  assert.ok(
    "zod-v4-core.js" in CLIENT_KERNEL_FILES,
    "zod-v4-core.js must be a served client chunk"
  );
  const hookform = CLIENT_KERNEL_FILES["hookform-resolvers-zod.js"] ?? "";
  assert.match(hookform, /from\s+["']\.\/zod-v4-core\.js["']/);
  assert.doesNotMatch(hookform, /from\s+["']zod\//);
});
