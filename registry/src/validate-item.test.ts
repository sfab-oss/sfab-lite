import assert from "node:assert/strict";
import { test } from "node:test";
import { validateItem } from "./lite.ts";
import type { RecipeItem } from "./types.ts";

const DEPENDENCIES_PIN = /expected an exact catalog pin name@version/;
const DEPENDENCIES_UNKNOWN = /unknown catalog module "lodash"/;
const DEPENDENCIES_WRONG = /catalog pin for "pdf-lib" must be 1.17.1/;
const DEPENDENCIES_EMPTY = /non-empty array of catalog pins/;
const UNKNOWN_THEME = /unknown item type "registry:theme"/;
const BARE_NAME = /bare names are a hard error/;
const MIGRATION_TARGET = /must not target applied-migration files/;

type ItemOverrides = {
  [K in keyof RecipeItem]?: unknown;
} & { dependencies?: unknown };

function base(overrides: ItemOverrides = {}) {
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

test("unpinned dependencies are rejected", () => {
  const hit = messages(base({ dependencies: ["lodash"] })).join("\n");
  assert.match(hit, DEPENDENCIES_PIN);
});

test("unknown catalog module names stay red", () => {
  const hit = messages(base({ dependencies: ["lodash@4.17.21"] })).join("\n");
  assert.match(hit, DEPENDENCIES_UNKNOWN);
});

test("wrong catalog pins stay red", () => {
  const hit = messages(base({ dependencies: ["pdf-lib@9.9.9"] })).join("\n");
  assert.match(hit, DEPENDENCIES_WRONG);
});

test("empty dependencies arrays are rejected", () => {
  const hit = messages(base({ dependencies: [] })).join("\n");
  assert.match(hit, DEPENDENCIES_EMPTY);
});

test("the catalog pdf-lib pin is accepted", () => {
  const result = validateItem(base({ dependencies: ["pdf-lib@1.17.1"] }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.item.dependencies, ["pdf-lib@1.17.1"]);
  }
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
