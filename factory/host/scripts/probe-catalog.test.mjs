import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertLiveAllowed,
  buildPlan,
  classifyTailEvent,
  FAST_BAND_CPU_MS,
  mountOrgProtected,
  PROBE_LIVE_ENV,
  parseProbeArgs,
  recipeMountSpec,
  runProbeCatalog,
  scoreTailEvents,
} from "./probe-catalog-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "probe-catalog.mjs");

function captureIo() {
  const log = [];
  const error = [];
  return {
    log,
    error,
    io: {
      log: (s) => {
        log.push(s);
      },
      error: (s) => {
        error.push(s);
      },
    },
  };
}

const SEED_INDEX = `import { Hono } from "hono";
import { requireOrg } from "../middleware/auth";
import type { AppEnv } from "../types";
import { balanceRoutes } from "./balances";
import { partyRoutes } from "./parties";

export const orgProtectedRoutes = new Hono<AppEnv>()
  .use("*", requireOrg)
  .route("/parties", partyRoutes)
  .route("/balances", balanceRoutes);
`;

test("dry-run is the default and prints recipes, N, worker, artifact", () => {
  const args = parseProbeArgs([]);
  assert.equal(args.mode, "dry-run");
  const plan = buildPlan(args, new Date("2026-09-04T00:00:00Z"));
  assert.deepEqual(plan.recipes, ["lite/pdf-invoice", "lite/xlsx-export"]);
  assert.equal(plan.nWarm, 20);
  assert.equal(plan.nCold, 10);
  assert.equal(plan.tailWorker, "sfab-lite-check");
  assert.equal(plan.artifact, "artifacts/2026-09-04-probe-catalog.md");
  assert.equal(plan.kill.fastBandCpuMs, FAST_BAND_CPU_MS);
  const cap = captureIo();
  const code = runProbeCatalog([], {}, cap.io);
  assert.equal(code, 0);
  assert.ok(cap.log.join("\n").includes("lite/pdf-invoice"));
  assert.ok(cap.log.join("\n").includes("sfab-lite-check"));
});

test("--live without the env flag is refused", () => {
  const cap = captureIo();
  const code = runProbeCatalog(["--live"], {}, cap.io);
  assert.equal(code, 2);
  assert.ok(cap.error.join("\n").includes("PROBE_CATALOG_LIVE=1"));
  assert.throws(
    () => assertLiveAllowed({}),
    (err) => err instanceof Error && err.message.includes("ask-first")
  );
});

test("--live with the env flag still does not create apps", () => {
  const cap = captureIo();
  const code = runProbeCatalog(["--live"], { [PROBE_LIVE_ENV]: "1" }, cap.io);
  assert.equal(code, 2);
  assert.ok(cap.error.join("\n").includes("not wired"));
});

test("CLI dry-run subprocess creates no side effects and exits 0", () => {
  const run = spawnSync(process.execPath, [cli, "--dry-run"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const plan = JSON.parse(run.stdout);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.template, "erp");
});

test("mount appends recipe routes on the org-protected index (F-013)", () => {
  const pdf = recipeMountSpec("lite/pdf-invoice");
  assert.equal(pdf.ident, "pdfInvoiceRoutes");
  assert.equal(pdf.routeCall, '.route("/pdf-invoice", pdfInvoiceRoutes)');
  const next = mountOrgProtected(SEED_INDEX, [
    "lite/pdf-invoice",
    "lite/xlsx-export",
  ]);
  assert.ok(next.includes('import { pdfInvoiceRoutes } from "./pdf-invoice";'));
  assert.ok(next.includes('import { xlsxExportRoutes } from "./xlsx-export";'));
  assert.ok(next.includes('.route("/pdf-invoice", pdfInvoiceRoutes)'));
  assert.ok(next.includes('.route("/xlsx-export", xlsxExportRoutes)'));
  assert.equal(
    mountOrgProtected(next, ["lite/pdf-invoice", "lite/xlsx-export"]),
    next
  );
});

test("tail scoring kills on exceededMemory and fast-band failures, not warm passes", () => {
  assert.equal(classifyTailEvent({ outcome: "ok", cpuTime: 900 }), "pass");
  assert.equal(
    classifyTailEvent({
      outcome: "exceededMemory",
      cpuTime: 5710,
      scriptName: "sfab-lite-check-exp",
    }),
    "exceededMemoryFast"
  );
  assert.equal(
    classifyTailEvent({
      t: "x",
      outcome: "exceededMemory",
      event: { outcome: "exceededMemory", cpuTime: 9000 },
    }),
    "exceededMemory"
  );
  const scored = scoreTailEvents([
    { outcome: "ok", cpuTime: 1200 },
    { outcome: "exceededMemory", cpuTime: 5710 },
  ]);
  assert.equal(scored.pass, 1);
  assert.equal(scored.exceededMemoryFast, 1);
  assert.equal(scored.kill, true);
  assert.equal(scoreTailEvents([{ outcome: "ok", cpuTime: 800 }]).kill, false);
});
