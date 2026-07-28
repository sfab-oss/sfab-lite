import assert from "node:assert/strict";
import { test } from "node:test";
import { toolError, toolResult } from "./tool-result.ts";

test("a result carries the same value as text and structured content", () => {
  const out = toolResult({ appId: "app_1", status: "ready" });
  assert.equal(out.isError, undefined);
  assert.deepEqual(out.structuredContent, { appId: "app_1", status: "ready" });
  assert.deepEqual(JSON.parse((out.content[0] as { text: string }).text), {
    appId: "app_1",
    status: "ready",
  });
});

/**
 * A caller reading only `structuredContent` must still be able to tell a
 * refusal from a result — `isError` alone is not enough, because MCP clients
 * routinely surface the payload and drop the flag.
 */
test("an error is marked and also says so in its payload", () => {
  const out = toolError("app_not_found", { status: 404 });
  assert.equal(out.isError, true);
  assert.deepEqual(out.structuredContent, {
    ok: false,
    error: "app_not_found",
    status: 404,
  });
});
