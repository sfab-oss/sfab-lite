import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogEntry,
  catalogModuleR2Prefix,
  catalogPins,
  isAllowedCatalogDependency,
  modulesFromRecipeNames,
  moduleTypesForManifest,
  parseCatalogPin,
} from "./catalog-modules.ts";

test("the catalog allowlists the pdf-lib pin and no other npm names", () => {
  assert.deepEqual(catalogPins(), ["pdf-lib@1.17.1"]);
  assert.equal(isAllowedCatalogDependency("pdf-lib@1.17.1"), true);
  assert.equal(isAllowedCatalogDependency("pdf-lib@9.9.9"), false);
  assert.equal(isAllowedCatalogDependency("pdf-lib"), false);
  assert.equal(isAllowedCatalogDependency("lodash@4.17.21"), false);
  assert.equal(parseCatalogPin("^pdf-lib@1.17.1"), null);
  assert.equal(catalogEntry("pdf-lib", "1.17.1")?.plane, "server");
  assert.equal(
    catalogModuleR2Prefix("pdf-lib", "1.17.1"),
    "modules/pdf-lib@1.17.1"
  );
});

test("moduleTypesForManifest is omitted when modules is empty", () => {
  assert.equal(moduleTypesForManifest([]), undefined);
});

test("moduleTypesForManifest overlays the cheap stub, not the .d.ts closure", () => {
  const overlay = moduleTypesForManifest([
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  assert.ok(overlay);
  const stub = overlay["/node_modules/pdf-lib/index.d.ts"] ?? "";
  assert.ok(stub.includes("export class PDFDocument"));
  assert.ok(stub.includes("StandardFonts"));
  assert.equal(Object.keys(overlay).length, 1);
  assert.equal(stub.includes("cjs/"), false);
});

test("modulesFromRecipeNames keeps only catalog pins for listed recipes", () => {
  assert.deepEqual(
    modulesFromRecipeNames(["lite/pdf-invoice", "lite/field"], {
      "lite/pdf-invoice": ["pdf-lib@1.17.1"],
    }),
    [{ name: "pdf-lib", version: "1.17.1" }]
  );
  assert.deepEqual(
    modulesFromRecipeNames(["lite/field"], {
      "lite/pdf-invoice": ["pdf-lib@1.17.1"],
    }),
    []
  );
  assert.deepEqual(
    modulesFromRecipeNames(["lite/pdf-invoice"], {
      "lite/pdf-invoice": ["lodash@4.17.21", "pdf-lib@1.17.1"],
    }),
    [{ name: "pdf-lib", version: "1.17.1" }]
  );
});
