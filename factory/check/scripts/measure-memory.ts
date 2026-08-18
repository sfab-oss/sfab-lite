/**
 * Where does the check worker's heap go?
 *
 * Runs real template sources through `runCheck` for N distinct appIds in one
 * process and reports heap after each, because the production symptom
 * (`exceededMemory` on 4 of 6 creates, retry succeeds) is isolate-reuse shaped:
 * a cold isolate passes, a warm one that already checked another app dies.
 *
 * EVICT=1 drops each app's LS state before the next check, which separates
 * "the store retains it" from "something else leaks".
 *
 * Bundled by the companion .mjs runner so Node can load workspace TS.
 */
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import { type LsStore, runCheck } from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const APPS = Number(process.env.APPS ?? 4);
const EVICT = process.env.EVICT === "1";

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".css")) {
    files[path] = text;
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Settle the heap so the reading reflects retained, not garbage, memory. */
function heapUsed(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

const store: LsStore = new Map();

console.log(`app source files: ${Object.keys(files).length}, evict=${EVICT}`);
const baseline = heapUsed();
console.log(`baseline (VFS module loaded, no program): ${mb(baseline)}\n`);

let prev = baseline;
for (let i = 1; i <= APPS; i++) {
  const t0 = Date.now();
  const appId = `app_${i}`;
  const result = runCheck({ appId, files, manifest: SEED_MANIFEST }, { store });
  if (EVICT) {
    store.delete(appId);
  }
  const after = heapUsed();
  console.log(
    JSON.stringify({
      app: i,
      diagnosticCount: result.diagnosticCount,
      rootFileCount: result.rootFileCount,
      checkMs: result.checkMs,
      wallMs: Date.now() - t0,
      heap: mb(after),
      delta: mb(after - prev),
      overBaseline: mb(after - baseline),
    })
  );
  prev = after;
}

console.log(`\ntotal heap after ${APPS} apps: ${mb(heapUsed())}`);
console.log("Workers isolate limit: 128 MB");

// What is the LS cache actually worth? Re-check the last app with one file
// edited, warm, and compare against the cold cost above.
const warmStore: LsStore = new Map();
runCheck(
  { appId: "warm", files, manifest: SEED_MANIFEST },
  { store: warmStore }
);
const edited = { ...files };
const key = Object.keys(edited).find((k) => k.endsWith(".ts")) as string;
edited[key] = `${edited[key]}\nexport const __probe = 1;\n`;
const t = Date.now();
const warm = runCheck(
  { appId: "warm", files: edited, manifest: SEED_MANIFEST },
  { store: warmStore }
);
console.log(
  `\nwarm re-check (1 file edited): ${Date.now() - t} ms, lsReused=${warm.lsReused}, diagnosticCount=${warm.diagnosticCount}`
);
