/**
 * In-process regression: the LS store stays bounded across distinct appIds.
 *
 * One TS program over the frozen types VFS retains ~320 MB and a Worker isolate
 * gets 128 MB, so an unbounded per-appId store kills the isolate on the second
 * distinct app it serves. That shipped, and surfaced in production as
 * `exceededMemory` on 4 of 6 create attempts with the retry succeeding — the
 * signature of isolate reuse, not of any particular app's code.
 *
 * Asserts the invariant two ways because either alone can pass while the bug is
 * back: the store holding one entry is what the fix *does*, and flat heap across
 * distinct apps is what the fix is *for*. A future refactor that bounds the map
 * but leaks the LanguageService elsewhere would satisfy only the first.
 *
 * Bundled by the companion .mjs runner (esbuild) so Node can load workspace TS.
 */
import seed from "../../factory/src/generated/seed.json" with { type: "json" };
import { type LsStore, runCheck } from "../src/run-check.ts";

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
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
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
let afterFirst = 0;
let last = 0;

for (let i = 1; i <= APPS; i++) {
  const result = runCheck({ appId: `bound_${i}`, files }, { store });
  if (result.diagnosticCount !== 0) {
    console.error(
      `FAIL: app ${i} did not typecheck clean (${result.diagnosticCount} diagnostics) — ` +
        "the seed template must be clean for this measurement to mean anything"
    );
    process.exit(1);
  }
  last = heapUsedMb();
  if (i === 1) {
    afterFirst = last;
  }
  if (store.size > 1) {
    console.error(
      `FAIL: store holds ${store.size} apps after checking ${i}; at most 1 may ` +
        "retain a LanguageService or the isolate exceeds its 128 MB limit"
    );
    process.exit(1);
  }
}

const growth = last - afterFirst;
console.log(
  JSON.stringify({
    apps: APPS,
    storeSize: store.size,
    heapAfterFirstMb: Number(afterFirst.toFixed(1)),
    heapAfterLastMb: Number(last.toFixed(1)),
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
