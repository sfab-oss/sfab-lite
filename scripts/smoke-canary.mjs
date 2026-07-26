#!/usr/bin/env node
/**
 * Post-deploy smoke test: fetch the canary app and prove it still runs.
 *
 * This exists for one failure mode that no source gate can see. An app's
 * client bundle is compiled against a specific `KERNEL_VERSION` and its HTML
 * carries an import map pinning `/kernel/<that version>/client/*`. Bump the
 * kernel and those chunks stop being in the Worker bundle; they have to come
 * from R2 instead (E-R2, #39). If the R2 upload did not happen, every chunk
 * 409s and every already-published app renders an empty `#root` — with the
 * whole repo green, because nothing in the source tree changed incorrectly.
 *
 * So the assertion is deliberately end-to-end and deliberately about a *real*
 * published app rather than a freshly created one: only an app that predates
 * the current kernel exercises the R2 path at all. The canary is dedicated and
 * never deleted for exactly that reason — "most recently published" would make
 * this test's meaning drift with whatever someone published last.
 *
 * Usage: SFAB_LITE_ORIGIN=https://… CANARY_APP_ID=app_… node scripts/smoke-canary.mjs
 */

import { readFileSync } from "node:fs";

const origin = process.env.SFAB_LITE_ORIGIN?.trim().replace(/\/+$/, "");
const appId = process.env.CANARY_APP_ID?.trim();

/** The version this deploy just shipped — the repo is the authority on it. */
const hostKernelVersion = JSON.parse(
  readFileSync(
    new URL("../packages/kernel/kernel.json", import.meta.url),
    "utf8"
  )
).version;

if (!(origin && appId)) {
  console.error(
    "smoke:canary — need SFAB_LITE_ORIGIN and CANARY_APP_ID.\n" +
      "Set CANARY_APP_ID as a repo variable pointing at the dedicated canary app."
  );
  process.exit(2);
}

const IMPORT_MAP_RE = /<script type="importmap">([\s\S]*?)<\/script>/;
const KERNEL_VERSION_RE = /^\/kernel\/([^/]+)\//;

const failures = [];
const notes = [];

function fail(what, detail) {
  failures.push(`${what} — ${detail}`);
  console.error(`  FAIL  ${what}\n        ${detail}`);
}

function pass(what, detail) {
  console.log(`  ok    ${what}${detail ? ` (${detail})` : ""}`);
}

/** 409 and 500 mean different upload faults; conflating them misdirects the fix. */
function explainChunkFailure(r) {
  if (r.status === 409) {
    return (
      "409 kernel_version_mismatch — this version's chunks are neither in the " +
      "Worker bundle nor in R2. The R2 upload step did not run, or ran after " +
      "the kernel had already moved on."
    );
  }
  if (r.status === 500) {
    return (
      "500 — the version IS known to R2 but this chunk object is missing: a " +
      "partial upload, not a missing one."
    );
  }
  return `${r.status || "request failed"}: ${r.body.slice(0, 160)}`;
}

async function main() {
  const appUrl = `${origin}/a/${encodeURIComponent(appId)}/`;
  console.log(`smoke:canary — ${appUrl}`);

  let html;
  try {
    const res = await fetch(appUrl, { redirect: "manual" });
    const body = await res.text();
    if (res.status !== 200) {
      fail(
        "app HTML",
        `expected 200, got ${res.status}: ${body.slice(0, 200)}`
      );
      return;
    }
    // A 409 here is the server-surface guard, not the kernel guard — different
    // failure, and conflating them sends the next reader to the wrong place.
    const served = res.headers.get("x-sfab-serve");
    const version = res.headers.get("x-sfab-version");
    html = body;
    pass("app HTML", `200, serve=${served}, version=${version}`);
  } catch (err) {
    fail("app HTML", `request threw: ${err.message}`);
    return;
  }

  const mapMatch = html.match(IMPORT_MAP_RE);
  if (!mapMatch) {
    fail("import map", 'no <script type="importmap"> in the served HTML');
    return;
  }

  let chunkUrls;
  try {
    const imports = JSON.parse(mapMatch[1]).imports ?? {};
    chunkUrls = [...new Set(Object.values(imports))];
  } catch (err) {
    fail("import map", `not valid JSON: ${err.message}`);
    return;
  }

  if (chunkUrls.length === 0) {
    fail("import map", "parsed but empty — the app would not boot");
    return;
  }
  pass("import map", `${chunkUrls.length} distinct kernel chunks`);

  // Whether this run proved anything depends on the two versions differing.
  // While the canary pins the version the host still bundles, its chunks are
  // served straight from the Worker and R2 is never consulted — the test goes
  // green without touching the path it exists to protect. Say so, rather than
  // letting a green check be read as evidence it is not.
  const pinned = chunkUrls[0].match(KERNEL_VERSION_RE)?.[1];
  notes.push(
    pinned === hostKernelVersion
      ? `canary pins kernel ${pinned}, which is also the deployed version — ` +
          "chunks came from the Worker bundle, so THIS RUN DID NOT EXERCISE R2. " +
          "It starts covering the fleet-blanking case at the next kernel bump."
      : `canary pins kernel ${pinned}, deployed host is ${hostKernelVersion} — ` +
          "chunks resolved through R2, which is the case this test exists for."
  );

  // Every chunk, not a sample: a partial R2 upload is exactly the shape of
  // failure this catches, and it does not distribute evenly.
  const results = await Promise.all(
    chunkUrls.map(async (path) => {
      const url = `${origin}${path}`;
      try {
        const res = await fetch(url, { method: "GET" });
        return {
          path,
          status: res.status,
          body: res.ok ? "" : await res.text(),
        };
      } catch (err) {
        return { path, status: 0, body: err.message };
      }
    })
  );

  const bad = results.filter((r) => r.status !== 200);
  if (bad.length === 0) {
    pass("kernel chunks", `${results.length}/${results.length} served 200`);
  }
  for (const r of bad) {
    fail(`kernel chunk ${r.path}`, explainChunkFailure(r));
  }

  // The app's own compiled entry, resolved relative to its mount.
  for (const asset of ["assets/app.js", "assets/app.css"]) {
    const url = `${appUrl}${asset}`;
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        pass(asset, `200, ${res.headers.get("content-type")}`);
      } else {
        fail(asset, `expected 200, got ${res.status}`);
      }
    } catch (err) {
      fail(asset, `request threw: ${err.message}`);
    }
  }
}

await main();

for (const note of notes) {
  console.log(`  note  ${note}`);
}

if (failures.length > 0) {
  console.error(
    `\nsmoke:canary — FAILED (${failures.length}). The deploy is live and the ` +
      "canary is broken; roll back or fix forward now."
  );
  process.exit(1);
}

console.log(
  "\nsmoke:canary — ok. The canary still serves and its kernel resolves."
);
