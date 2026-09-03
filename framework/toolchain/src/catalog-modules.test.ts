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

test("the catalog allowlists the pdf-lib and exceljs pins and no other npm names", () => {
  assert.deepEqual(catalogPins(), ["exceljs@4.4.0", "pdf-lib@1.17.1"]);
  assert.equal(isAllowedCatalogDependency("pdf-lib@1.17.1"), true);
  assert.equal(isAllowedCatalogDependency("exceljs@4.4.0"), true);
  assert.equal(isAllowedCatalogDependency("pdf-lib@9.9.9"), false);
  assert.equal(isAllowedCatalogDependency("exceljs@9.9.9"), false);
  assert.equal(isAllowedCatalogDependency("pdf-lib"), false);
  assert.equal(isAllowedCatalogDependency("lodash@4.17.21"), false);
  assert.equal(parseCatalogPin("^pdf-lib@1.17.1"), null);
  assert.equal(catalogEntry("pdf-lib", "1.17.1")?.plane, "server");
  assert.equal(catalogEntry("exceljs", "4.4.0")?.plane, "server");
  assert.equal(catalogEntry("exceljs", "4.4.0")?.reexportDefault, true);
  assert.equal(catalogEntry("pdf-lib", "1.17.1")?.reexportDefault, false);
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

test("moduleTypesForManifest overlays both cheap stubs when both are declared", () => {
  const overlay = moduleTypesForManifest([
    { name: "pdf-lib", version: "1.17.1" },
    { name: "exceljs", version: "4.4.0" },
  ]);
  assert.ok(overlay);
  const pdf = overlay["/node_modules/pdf-lib/index.d.ts"] ?? "";
  const xlsx = overlay["/node_modules/exceljs/index.d.ts"] ?? "";
  assert.ok(pdf.includes("export class PDFDocument"));
  assert.ok(xlsx.includes("export default ExcelJS"));
  assert.ok(xlsx.includes("Workbook"));
  assert.equal(xlsx.includes("cjs/"), false);
  assert.deepEqual(Object.keys(overlay).sort(), [
    "/node_modules/exceljs/index.d.ts",
    "/node_modules/pdf-lib/index.d.ts",
  ]);
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
  assert.deepEqual(
    modulesFromRecipeNames(["lite/pdf-invoice", "lite/xlsx-export"], {
      "lite/pdf-invoice": ["pdf-lib@1.17.1"],
      "lite/xlsx-export": ["exceljs@4.4.0"],
    }),
    [
      { name: "exceljs", version: "4.4.0" },
      { name: "pdf-lib", version: "1.17.1" },
    ]
  );
});
