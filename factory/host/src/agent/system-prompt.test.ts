import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./system-prompt.ts";

const prompt = buildSystemPrompt({
  appId: "app_01TEST",
  repoHint: "example",
  sourceFiles: ["src/hono/index.ts"],
});

test("the prompt states the closed import surface", () => {
  assert.ok(prompt.includes("LITE-RESOLVE"));
  assert.ok(prompt.includes("transitive-only"));
  assert.ok(prompt.includes("kysely"));
});

test("the prompt no longer admits that transitive imports pass typecheck", () => {
  assert.equal(prompt.includes("Typecheck alone will not always catch"), false);
  assert.equal(prompt.includes("importing one can pass"), false);
});
