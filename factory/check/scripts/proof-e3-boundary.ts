/**
 * Product extra-unit proof: catalog boundary files run a `modules` unit
 * against the real `.d.ts` after cheap server/emit/client. Overlay gone after.
 *
 *   node scripts/run-measure.mjs proof-e3-boundary.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { moduleTypesForManifest } from "@sfab-lite/core/catalog-modules";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import {
  type LsStore,
  liveLanguageServices,
  runCheck,
} from "@sfab-lite/verbs/check";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PDF_STUB = "/node_modules/pdf-lib/index.d.ts";
const PDF_REAL = "/node_modules/pdf-lib/cjs/api/PDFDocument.d.ts";
const XLSX_STUB = "/node_modules/exceljs/index.d.ts";

const store: LsStore = new Map();
const seen: Record<string, { index?: string; realDoc?: string }> = {};

function seedFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, text] of Object.entries(
    seed.sourceFiles as Record<string, string>
  )) {
    if (
      path.endsWith(".ts") ||
      path.endsWith(".tsx") ||
      path.endsWith(".d.ts") ||
      path.endsWith(".css") ||
      path.endsWith(".hash")
    ) {
      out[path] = text;
    }
  }
  return out;
}

function files(): Record<string, string> {
  return {
    ...seedFiles(),
    "src/pdf/invoice.ts": readFileSync(
      join(repoRoot, "registry/recipes/pdf-invoice/0.1.1/invoice.ts"),
      "utf8"
    ),
    "src/hono/org-protected/pdf-invoice.ts": readFileSync(
      join(repoRoot, "registry/recipes/pdf-invoice/0.1.1/pdf-invoice.ts"),
      "utf8"
    ),
    "src/xlsx/export.ts": readFileSync(
      join(repoRoot, "registry/recipes/xlsx-export/0.1.0/export.ts"),
      "utf8"
    ),
    "src/hono/org-protected/xlsx-export.ts": readFileSync(
      join(repoRoot, "registry/recipes/xlsx-export/0.1.0/xlsx-export.ts"),
      "utf8"
    ),
  };
}

function manifest() {
  const parsed = JSON.parse(
    (seed.sourceFiles as Record<string, string>)["manifest.json"] ?? "{}"
  );
  parsed.modules = [
    { name: "pdf-lib", version: "1.17.1" },
    { name: "exceljs", version: "4.4.0" },
  ];
  return parsed;
}

const control = runCheck(
  {
    appId: "e3-product-control",
    files: seedFiles(),
    manifest: JSON.parse(
      (seed.sourceFiles as Record<string, string>)["manifest.json"] ?? "{}"
    ),
    forceCold: true,
  },
  { store }
);
if (control.units?.some((u) => u.unit === "modules")) {
  throw new Error("ERP seed without boundary files must not run modules");
}
if (control.diagnosticCount !== 0) {
  throw new Error(`control seed must be clean, got ${control.diagnosticCount}`);
}

const both = runCheck(
  {
    appId: "e3-product-both",
    files: files(),
    manifest: manifest(),
    forceCold: true,
    moduleTypes: moduleTypesForManifest([
      { name: "pdf-lib", version: "1.17.1" },
      { name: "exceljs", version: "4.4.0" },
    ]),
  },
  {
    store,
    afterUnit: (unit, overlay) => {
      seen[unit.unit] = {
        index: overlay.get(PDF_STUB),
        realDoc: overlay.get(PDF_REAL),
      };
    },
  }
);
const extra = both.units?.find((u) => u.unit === "modules");
if (!extra || extra.skipped) {
  throw new Error("boundary files must run the modules unit");
}
if (extra.diagnosticCount !== 0) {
  throw new Error(`modules unit must be clean, got ${extra.diagnosticCount}`);
}
if (both.diagnosticCount !== 0) {
  throw new Error(`expected 0 diagnostics, got ${both.diagnosticCount}`);
}
if (!seen.server?.index?.includes("export class PDFDocument")) {
  throw new Error("server unit must see the cheap pdf-lib stub");
}
if (seen.server.realDoc != null) {
  throw new Error("server unit must not see the real pdf-lib vfs");
}
if (
  seen.modules?.realDoc == null ||
  seen.modules.realDoc === seen.server.index
) {
  throw new Error("modules unit must overlay the real pdf-lib vfs");
}
if (seen.modules.index === seen.server.index) {
  throw new Error("modules unit must replace the cheap stub at index.d.ts");
}
if (liveLanguageServices(store) !== 0) {
  throw new Error("modules unit leaked LanguageService");
}
const leftover = store.get("e3-product-both");
const leftoverKeys = [...(leftover?.overlay.keys() ?? [])];
if (leftoverKeys.some((k) => k.startsWith("/node_modules/pdf-lib"))) {
  throw new Error("real pdf-lib overlay must be stripped after runCheck");
}
if (leftoverKeys.some((k) => k.startsWith("/node_modules/exceljs"))) {
  throw new Error("real exceljs overlay must be stripped after runCheck");
}
if (leftover?.overlay.has(XLSX_STUB) || leftover?.overlay.has(PDF_STUB)) {
  throw new Error("cheap catalog stubs must be stripped after runCheck");
}

console.log(
  JSON.stringify({
    controlUnits: control.units?.map((u) => u.unit),
    bothUnits: both.units?.map((u) => `${u.unit}:${u.diagnosticCount}`),
    extraRoots: extra.rootFileCount,
    cheapStubChars: seen.server?.index?.length,
    realIndexChars: seen.modules?.index?.length,
    realPdfDocumentChars: seen.modules?.realDoc?.length,
  })
);
