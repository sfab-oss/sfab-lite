import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import { overlayFormatFiles } from "./overlay-format-files.ts";

const RECIPE_DEPS = {
  "lite/pdf-invoice": ["pdf-lib@1.17.1"],
  "lite/xlsx-export": ["exceljs@4.4.0"],
} as const;

function manifest(overrides: Partial<ManifestV0> = {}): ManifestV0 {
  return {
    format: 0,
    name: "erp",
    runtime: "^0",
    adapter: "cloudflare",
    root: "app",
    server: { entry: "src/server.ts", exportName: "app" },
    client: { entry: "src/router.tsx", styles: "src/styles.css" },
    html: "index.html",
    safelist: "safelist.txt",
    migrations: "migrations",
    schema: "src/db/schema.ts",
    inject: {},
    source: {
      dirs: ["src"],
      extensions: [".ts"],
      files: ["package.json"],
      exclude: [],
    },
    capabilities: [],
    modules: [],
    recipes: {},
    ...overrides,
  };
}

function tree(overrides: Partial<ManifestV0> = {}): Record<string, string> {
  return {
    "manifest.json": `${JSON.stringify(manifest(overrides), null, 2)}\n`,
  };
}

test("overlay recomputes modules from recipes and drops owner edits", () => {
  const overlaid = overlayFormatFiles(
    tree({
      recipes: {
        "lite/pdf-invoice": {
          version: "0.1.0",
          files: {
            "src/pdf/invoice.ts":
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
      },
      modules: [{ name: "lodash", version: "4.17.21" }],
    }),
    {
      registryUrl: "https://lite.sfab.dev/r/{name}.json",
      recipeDependencies: RECIPE_DEPS,
    }
  );
  assert.deepEqual(overlaid.manifest.modules, [
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  const written = JSON.parse(overlaid.files["manifest.json"] ?? "{}");
  assert.deepEqual(written.modules, [{ name: "pdf-lib", version: "1.17.1" }]);
  const pkg = JSON.parse(overlaid.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies["pdf-lib"], "1.17.1");
  assert.equal(pkg.dependencies.lodash, undefined);
});

test("overlay of both recipes writes both modules and package.json deps", () => {
  const overlaid = overlayFormatFiles(
    tree({
      recipes: {
        "lite/pdf-invoice": {
          version: "0.1.1",
          files: {
            "src/pdf/invoice.ts":
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
        "lite/xlsx-export": {
          version: "0.1.0",
          files: {
            "src/xlsx/export.ts":
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
        },
      },
    }),
    {
      registryUrl: "https://lite.sfab.dev/r/{name}.json",
      recipeDependencies: RECIPE_DEPS,
    }
  );
  assert.deepEqual(overlaid.manifest.modules, [
    { name: "exceljs", version: "4.4.0" },
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  const written = JSON.parse(overlaid.files["manifest.json"] ?? "{}");
  assert.deepEqual(written.modules, [
    { name: "exceljs", version: "4.4.0" },
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  const pkg = JSON.parse(overlaid.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies.exceljs, "4.4.0");
  assert.equal(pkg.dependencies["pdf-lib"], "1.17.1");
});

test("overlay clears modules when no enabling recipe remains", () => {
  const overlaid = overlayFormatFiles(
    tree({
      modules: [{ name: "pdf-lib", version: "1.17.1" }],
    }),
    {
      registryUrl: "https://lite.sfab.dev/r/{name}.json",
      recipeDependencies: RECIPE_DEPS,
    }
  );
  assert.deepEqual(overlaid.manifest.modules, []);
  const written = JSON.parse(overlaid.files["manifest.json"] ?? "{}");
  assert.deepEqual(written.modules, []);
  const pkg = JSON.parse(overlaid.files["package.json"] ?? "{}");
  assert.equal(pkg.dependencies["pdf-lib"], undefined);
});
