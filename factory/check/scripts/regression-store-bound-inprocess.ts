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
 * Heap growth allowed from the first app's program to the last, in MB.
 * With the fix the observed per-app delta is 1-2 MB; without it, ~320 MB.
 * Sized for that gap, not for the current number, so normal drift cannot trip
 * it and a real regression cannot slip under it.
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

// Node 22 `gc()` often leaves one disposed ~310 MB LanguageService on the
// heap until the *next* runCheck (storeSize stays 1, live services 0).
// last-minus-first then looks like the old per-app leak whenever the
// zombie is the last sample. A real leak is monotonic; a zombie is a
// spike. Growth is min(later samples) minus first, after one cooldown
// run so app 6's zombie has a following check to collect it.
const afterFirst = heapsMb[0] ?? 0;
heapsMb.push(Number(runBounded("bound_cooldown").toFixed(1)));
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
    `FAIL: heap grew ${growth.toFixed(1)} MB across ${APPS} distinct apps ` +
      `(limit ${MAX_GROWTH_MB} MB) — a program is being retained per app`
  );
  process.exit(1);
}

console.log(
  `PASS: store bounded at 1 app, heap flat (+${growth.toFixed(1)} MB) across ${APPS} apps`
);
