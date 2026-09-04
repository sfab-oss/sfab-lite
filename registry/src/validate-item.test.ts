import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateItem } from "./lite.ts";
import type { RecipeItem } from "./types.ts";

const recipesRoot = join(dirname(fileURLToPath(import.meta.url)), "../recipes");

const DEPENDENCIES_PIN = /expected an exact catalog pin name@version/;
const DEPENDENCIES_UNKNOWN = /unknown catalog module "lodash"/;
const DEPENDENCIES_WRONG = /catalog pin for "pdf-lib" must be 1.17.1/;
const DEPENDENCIES_EMPTY = /non-empty array of catalog pins/;
const UNKNOWN_THEME = /unknown item type "registry:theme"/;
const BARE_NAME = /bare names are a hard error/;
const MIGRATION_TARGET = /must not target applied-migration files/;
const CATALOG_BOUNDARY = /requires boundary "src\/pdf"/;

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

test("the catalog pdf-lib pin is accepted under src/pdf", () => {
  const result = validateItem(
    base({
      dependencies: ["pdf-lib@1.17.1"],
      files: [
        {
          path: "invoice.ts",
          type: "registry:file",
          target: "src/pdf/invoice.ts",
        },
      ],
    })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.item.dependencies, ["pdf-lib@1.17.1"]);
  }
});

test("the catalog exceljs pin is accepted under src/xlsx", () => {
  const result = validateItem(
    base({
      dependencies: ["exceljs@4.4.0"],
      files: [
        {
          path: "export.ts",
          type: "registry:file",
          target: "src/xlsx/export.ts",
        },
      ],
    })
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.item.dependencies, ["exceljs@4.4.0"]);
  }
});

test("catalog pins without a matching helper directory stay red", () => {
  const hit = messages(base({ dependencies: ["pdf-lib@1.17.1"] })).join("\n");
  assert.match(hit, CATALOG_BOUNDARY);
});

test("meta.liteBoundary satisfies the pin when helpers are only under src/hono", () => {
  const result = validateItem(
    base({
      dependencies: ["pdf-lib@1.17.1"],
      meta: {
        liteProfile: 1,
        liteRuntime: ">=0.4.0",
        liteBoundary: "src/pdf",
      },
      files: [
        {
          path: "route.ts",
          type: "registry:file",
          target: "src/hono/org-protected/route.ts",
        },
      ],
    })
  );
  assert.equal(result.ok, true);
});

test("meta.liteBoundary that disagrees with the pin stays red", () => {
  const hit = messages(
    base({
      dependencies: ["pdf-lib@1.17.1"],
      meta: {
        liteProfile: 1,
        liteRuntime: ">=0.4.0",
        liteBoundary: "src/xlsx",
      },
      files: [
        {
          path: "invoice.ts",
          type: "registry:file",
          target: "src/pdf/invoice.ts",
        },
      ],
    })
  ).join("\n");
  assert.match(hit, CATALOG_BOUNDARY);
});

test("published pdf-invoice 0.1.1 still validates without meta.liteBoundary", () => {
  const item = JSON.parse(
    readFileSync(
      join(recipesRoot, "pdf-invoice/0.1.1/registry-item.json"),
      "utf8"
    )
  );
  const result = validateItem(item);
  assert.equal(result.ok, true);
});

test("published xlsx-export 0.1.0 still validates without meta.liteBoundary", () => {
  const item = JSON.parse(
    readFileSync(
      join(recipesRoot, "xlsx-export/0.1.0/registry-item.json"),
      "utf8"
    )
  );
  const result = validateItem(item);
  assert.equal(result.ok, true);
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
