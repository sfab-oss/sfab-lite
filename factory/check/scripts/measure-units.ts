/**
 * Product-path unit timings + heap for the check loop.
 *
 *   node scripts/run-measure.mjs measure-units.ts
 *
 * Isolated per-unit heap still lives in measure-snapshot.ts (93 / 92 / 147–175
 * experiment numbers). This script times the shipped server → emit → client
 * runCheck path. Local heap is an indicator, never a production claim.
 */
import seed from "@sfab-lite/template/seed" with { type: "json" };
import { type LsStore, runCheck } from "../src/run-check.ts";

const files: Record<string, string> = {};
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
    files[path] = text;
  }
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
    { appId: label, files: runFiles, forceCold: true },
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
      diagnostics: result.diagnostics.slice(0, 5),
      units: result.units,
      peaks,
      checkMs: result.checkMs,
      wallMs: result.wallMs,
      rootFileCount: result.rootFileCount,
      emittedBytes: result.emittedFiles
        ? Object.fromEntries(
            Object.entries(result.emittedFiles).map(([k, v]) => [k, v.length])
          )
        : {},
      serverTreeHash: result.serverTreeHash,
      heapBeforeMb: Number(before.toFixed(1)),
      heapAfterMb: Number(after.toFixed(1)),
      heapRetainedMb: Number((after - before).toFixed(0)),
    })
  );
}

runLabeled("warm-matching-snapshot", files);
const { "src/generated/api.hash": _hash, ...coldFiles } = files;
runLabeled("cold-emit", coldFiles);
