import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catalogExportLeakageDiagnostics,
  LITE_BOUNDARY_EXPORT_CODE,
} from "./catalog-export-leak.ts";

const LITE_BOUNDARY = /LITE-BOUNDARY/;
const PDF_LIB = /pdf-lib/;

test("flags re-exports of catalog modules from boundary files", () => {
  const diags = catalogExportLeakageDiagnostics({
    "src/pdf/invoice.ts": 'export type { PDFDocument } from "pdf-lib";\n',
  });
  assert.equal(diags.length, 1);
  assert.equal(diags[0]?.code, LITE_BOUNDARY_EXPORT_CODE);
  assert.match(diags[0]?.message ?? "", LITE_BOUNDARY);
  assert.match(diags[0]?.message ?? "", PDF_LIB);
  assert.equal(diags[0]?.file, "/app/src/pdf/invoice.ts");
  assert.equal(diags[0]?.line, 1);
});

test("skips the generated snapshot tree and non-ts files", () => {
  const diags = catalogExportLeakageDiagnostics({
    "src/generated/api.d.ts": 'export type { PDFDocument } from "pdf-lib";\n',
    "src/readme.md": 'export * from "pdf-lib";\n',
    "package.json": "{}\n",
  });
  assert.deepEqual(diags, []);
});
