/**
 * In-process regression: the LS store stays bounded across distinct appIds.
 *
 * One TS program over the frozen types VFS retains hundreds of MB and a Worker
 * isolate gets 128 MB, so an unbounded per-appId store kills the isolate on the
 * second distinct app it serves. Units dispose between programs, so the gate
 * is now: at most one app in the store, and zero live LanguageServices after
 * a run returns.
 *
 * Bundled by the companion .mjs runner (esbuild) so Node can load workspace TS.
 */
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import {
  type LsStore,
  liveLanguageServices,
  runCheck,
} from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

/** Distinct apps to check. Must exceed 2 — the bug needs a second app. */
const APPS = 6;
/**
 * At least one later sample must sit within this many MB of the first.
 * Node 22 `gc()` often leaves one disposed ~310 MB LanguageService on the
 * heap until the next runCheck (storeSize 1, live services 0) — a spike,
 * not a leak. last-minus-first then looks like the old per-app leak
 * (~320 MB) whenever that zombie is the last sample. min(later) − first
 * survives those spikes. A monotonic extra program still fails: every
 * later sample is ~+310. A staircase of <+50 MB/app is invisible here
 * (old last-minus-first would have accumulated it); that is accepted —
 * the 50 was sized for the 1–2 vs ~320 gap, not as a cumulative budget.
 */
const MAX_GROWTH_MB = 50;

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".css")) {
    files[path] = text;
  }
}

function heapUsedMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

const store: LsStore = new Map();

function runBounded(appId: string): number {
  const result = runCheck({ appId, files, manifest: SEED_MANIFEST }, { store });
  if (result.diagnosticCount !== 0) {
    console.error(
      `FAIL: ${appId} did not typecheck clean (${result.diagnosticCount} diagnostics) — ` +
        "the seed template must be clean for this measurement to mean anything"
    );
    if (result.diagnostics[0]) {
      console.error(JSON.stringify(result.diagnostics.slice(0, 5), null, 2));
    }
    process.exit(1);
  }
  if (store.size > 1) {
    console.error(
      `FAIL: store holds ${store.size} apps after ${appId}; at most 1 may ` +
        "retain a LanguageService or the isolate exceeds its 128 MB limit"
    );
    process.exit(1);
  }
  if (liveLanguageServices(store) !== 0) {
    console.error(
      `FAIL: ${liveLanguageServices(store)} LanguageService(s) still live after ` +
        `${appId}; units must dispose so zero programs remain between runs`
    );
    process.exit(1);
  }
  return heapUsedMb();
}

const heapsMb: number[] = [];

for (let i = 1; i <= APPS; i++) {
  heapsMb.push(Number(runBounded(`bound_${i}`).toFixed(1)));
}

const afterFirst = heapsMb[0] ?? 0;
const later = heapsMb.slice(1);
const minLater = Math.min(...later);
const growth = minLater - afterFirst;
console.log(
  JSON.stringify({
    apps: APPS,
    storeSize: store.size,
    heapsMb,
    heapAfterFirstMb: afterFirst,
    heapMinLaterMb: minLater,
    growthMb: Number(growth.toFixed(1)),
    limitMb: MAX_GROWTH_MB,
  })
);

if (growth > MAX_GROWTH_MB) {
  console.error(
    `FAIL: no later sample is within ${MAX_GROWTH_MB} MB of first ` +
      `(minLater ${minLater.toFixed(1)} − first ${afterFirst.toFixed(1)} = ` +
      `${growth.toFixed(1)} MB) — every later check retained an extra program`
  );
  process.exit(1);
}

console.log(
  `PASS: store bounded at 1 app, heap flat (+${growth.toFixed(1)} MB) across ${APPS} apps`
);
