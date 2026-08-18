/**
 * Starter vs starter-plus-all-recipes local check.
 *
 *   node scripts/run-measure.mjs measure-assembled-recipes.ts
 *
 * Local heap is an indicator, never a production claim. The production
 * ceiling stays the units 0/8 re-tail; this records the first-recipes
 * assembly so they do not ship unmeasured.
 */
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import { type LsStore, runCheck } from "@sfab-lite/verbs/check";
import { CATALOG } from "../../../registry/src/catalog.ts";
import { catalogNames, planAdd } from "../../../registry/src/lite.ts";
import { SEED_MANIFEST } from "./seed-manifest.ts";

function checkFiles(
  sourceFiles: Record<string, string>
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [path, text] of Object.entries(sourceFiles)) {
    if (
      path.endsWith(".ts") ||
      path.endsWith(".tsx") ||
      path.endsWith(".d.ts") ||
      path.endsWith(".css") ||
      path.endsWith(".hash") ||
      path === "manifest.json"
    ) {
      files[path] = text;
    }
  }
  return files;
}

function assemble(sourceFiles: Record<string, string>): Record<string, string> {
  const files = { ...sourceFiles };
  const recipes: Record<string, unknown> = {};
  for (const name of catalogNames(CATALOG)) {
    const planned = planAdd(name, CATALOG, files);
    if (!planned.ok) {
      throw new Error(`add ${name}: ${planned.error}`);
    }
    Object.assign(files, planned.writes);
    Object.assign(recipes, planned.provenance);
  }
  const manifest = {
    ...(seed.manifest as Record<string, unknown>),
    recipes,
  };
  files["manifest.json"] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function runLabeled(label: string, runFiles: Record<string, string>): void {
  const store: LsStore = new Map();
  const peaks: Record<string, unknown>[] = [];
  const before = heapMb();
  const result = runCheck(
    { appId: label, files: runFiles, manifest: SEED_MANIFEST, forceCold: true },
    {
      store,
      afterUnit: (unit) => {
        if (unit.skipped) {
          return;
        }
        peaks.push({
          unit: unit.unit,
          checkMs: unit.checkMs,
          rootFileCount: unit.rootFileCount,
          heapMb: Number(heapMb().toFixed(1)),
        });
      },
    }
  );
  const after = heapMb();
  console.log(
    JSON.stringify({
      label,
      diagnosticCount: result.diagnosticCount,
      diagnostics: result.diagnostics.slice(0, 8),
      units: result.units,
      peaks,
      checkMs: result.checkMs,
      wallMs: result.wallMs,
      rootFileCount: result.rootFileCount,
      fileCount: Object.keys(runFiles).length,
      heapBeforeMb: Number(before.toFixed(1)),
      heapAfterMb: Number(after.toFixed(1)),
    })
  );
}

const starter = checkFiles(seed.sourceFiles as Record<string, string>);
runLabeled("starter", starter);
runLabeled(
  "starter-plus-recipes",
  checkFiles(assemble(seed.sourceFiles as Record<string, string>))
);
