import assert from "node:assert/strict";
import { test } from "node:test";
import { realModuleTypesForOverlay } from "./catalog-real-vfs.ts";

test("ERP overlay with no catalog helpers yields no extra unit", () => {
  const overlay = new Map([["/app/src/server.ts", "export const app = 1;\n"]]);
  const planned = realModuleTypesForOverlay(overlay);
  assert.deepEqual(planned.roots, []);
  assert.deepEqual(planned.types, {});
});

test("src/pdf helpers pull the pdf-lib real vfs, not exceljs", () => {
  const overlay = new Map([
    ["/app/src/pdf/invoice.ts", "export const n = 1;\n"],
    ["/app/src/hono/org-protected/pdf-invoice.ts", "export const r = 1;\n"],
  ]);
  const planned = realModuleTypesForOverlay(overlay);
  assert.deepEqual(planned.roots, ["/app/src/pdf/invoice.ts"]);
  assert.ok(planned.types["/node_modules/pdf-lib/cjs/api/PDFDocument.d.ts"]);
  assert.equal(planned.types["/node_modules/exceljs/index.d.ts"], undefined);
  assert.ok(Object.keys(planned.types).length > 10);
});

test("both boundary prefixes union both real slices", () => {
  const overlay = new Map([
    ["/app/src/pdf/invoice.ts", "export const n = 1;\n"],
    ["/app/src/xlsx/export.ts", "export const n = 1;\n"],
  ]);
  const planned = realModuleTypesForOverlay(overlay);
  assert.deepEqual(
    [...planned.roots].sort((a, b) => a.localeCompare(b)),
    ["/app/src/pdf/invoice.ts", "/app/src/xlsx/export.ts"]
  );
  assert.ok(planned.types["/node_modules/pdf-lib/index.d.ts"]);
  assert.ok(planned.types["/node_modules/exceljs/index.d.ts"]);
});
