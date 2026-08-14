import assert from "node:assert/strict";
import { test } from "node:test";
import { validateItem } from "./lite.ts";

const DEPENDENCIES_ABSENT = /dependencies key must be absent/;
const UNKNOWN_THEME = /unknown item type "registry:theme"/;
const BARE_NAME = /bare names are a hard error/;
const MIGRATION_TARGET = /must not target applied-migration files/;

function base(overrides: Record<string, unknown> = {}) {
  return {
    name: "lite/button",
    type: "registry:ui",
    title: "Button",
    description: "Use when the app needs a pressable control.",
    registryDependencies: ["lite/utils"],
    meta: { liteProfile: 1, liteRuntime: ">=0.4.0" },
    files: [
      {
        path: "button.tsx",
        type: "registry:ui",
        target: "src/components/ui/button.tsx",
      },
    ],
    ...overrides,
  };
}

function messages(input: unknown): string[] {
  const result = validateItem(input);
  assert.equal(result.ok, false);
  return result.issues.map((i) => `${i.path}: ${i.message}`);
}

test("a complete lite item validates", () => {
  const result = validateItem(base());
  assert.equal(result.ok, true);
});

test("dependencies key is rejected even when empty", () => {
  const hit = messages(base({ dependencies: [] })).join("\n");
  assert.match(hit, DEPENDENCIES_ABSENT);
});

test("unknown item types are rejected", () => {
  const hit = messages(base({ type: "registry:theme" })).join("\n");
  assert.match(hit, UNKNOWN_THEME);
});

test("bare registryDependencies names hard-fail", () => {
  const hit = messages(base({ registryDependencies: ["button"] })).join("\n");
  assert.match(hit, BARE_NAME);
});

test("migration targets are refused", () => {
  const hit = messages(
    base({
      files: [
        {
          path: "0003_ledger.sql",
          type: "registry:file",
          target: "migrations/0003_ledger.sql",
        },
      ],
    })
  ).join("\n");
  assert.match(hit, MIGRATION_TARGET);
});
