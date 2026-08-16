import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./system-prompt.ts";

const prompt = buildSystemPrompt({
  appId: "app_01TEST",
  repoHint: "example",
  sourceFiles: ["src/server.ts"],
});

test("the prompt states the closed import surface", () => {
  assert.ok(prompt.includes("LITE-RESOLVE"));
  assert.ok(prompt.includes("transitive-only"));
  assert.ok(prompt.includes("kysely"));
});

test("the prompt names generated files as host-owned", () => {
  assert.ok(
    prompt.includes("Those files are generated. Edit manifest.json, not them.")
  );
  assert.ok(prompt.includes("src/generated/**"));
  assert.ok(prompt.includes("src/db/index.ts"));
  assert.ok(prompt.includes("src/storage/index.ts"));
  assert.equal(prompt.includes("package.json is writable."), false);
});
