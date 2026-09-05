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
import {
  filePathsFromGlob,
  isProtectedApp,
  NEVER_TOUCH_APP_IDS,
  runLiveSequence,
} from "./probe-catalog-live.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "probe-catalog.mjs");
const ADD_FAILED = /add failed/;

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

test("dry-run is the default and prints recipes, N, worker, artifact", async () => {
  const args = parseProbeArgs([]);
  assert.equal(args.mode, "dry-run");
  const plan = buildPlan(args, new Date("2026-09-04T00:00:00Z"));
  assert.deepEqual(plan.recipes, ["lite/pdf-invoice", "lite/xlsx-export"]);
  assert.equal(plan.nWarm, 20);
  assert.equal(plan.nCold, 10);
  assert.equal(plan.tailWorker, "sfab-lite-check");
  assert.equal(plan.artifact, "artifacts/2026-09-04-probe-catalog.md");
  assert.equal(plan.factory, "https://lite.sfab.dev");
  assert.equal(plan.kill.fastBandCpuMs, FAST_BAND_CPU_MS);
  const cap = captureIo();
  const code = await runProbeCatalog([], {}, cap.io);
  assert.equal(code, 0);
  assert.ok(cap.log.join("\n").includes("lite/pdf-invoice"));
  assert.ok(cap.log.join("\n").includes("sfab-lite-check"));
});

test("--live without the env flag is refused", async () => {
  const cap = captureIo();
  const code = await runProbeCatalog(["--live"], {}, cap.io);
  assert.equal(code, 2);
  assert.ok(cap.error.join("\n").includes("PROBE_CATALOG_LIVE=1"));
  assert.throws(
    () => assertLiveAllowed({}),
    (err) => err instanceof Error && err.message.includes("ask-first")
  );
});

test("--live with the env flag calls the injected driver and does not create apps", async () => {
  const cap = captureIo();
  let seen = null;
  const code = await runProbeCatalog(
    ["--live"],
    { [PROBE_LIVE_ENV]: "1" },
    cap.io,
    {
      runLive: (plan) => {
        seen = plan;
        return Promise.resolve(0);
      },
    }
  );
  assert.equal(code, 0);
  assert.equal(seen.mode, "live");
  assert.equal(seen.template, "erp");
  assert.equal(cap.error.length, 0);
});

test("live sequence deletes the created app when a later step throws", async () => {
  const deleted = [];
  const bash = [];
  await assert.rejects(
    () =>
      runLiveSequence(
        {
          appName: "probe-test",
          template: "erp",
          recipes: ["lite/pdf-invoice"],
          nWarm: 1,
          nCold: 0,
          spaceMs: 0,
        },
        {
          log: () => undefined,
          sleep: () => Promise.resolve(),
          createApp: () => Promise.resolve({ appId: "app_probe_test" }),
          waitReady: () => Promise.resolve({}),
          addRecipe: () => Promise.reject(new Error("add failed")),
          deleteApp: (id) => {
            deleted.push(id);
            return Promise.resolve();
          },
          bash: (_id, command) => {
            bash.push(command);
            return Promise.resolve({ stdout: "", exitCode: 0, passed: true });
          },
        }
      ),
    ADD_FAILED
  );
  assert.deepEqual(deleted, ["app_probe_test"]);
  assert.equal(bash.length, 0);
});

test("live sequence create → add → mount → typecheck → delete", async () => {
  const calls = [];
  const result = await runLiveSequence(
    {
      appName: "probe-test",
      template: "erp",
      recipes: ["lite/pdf-invoice"],
      nWarm: 1,
      nCold: 1,
      spaceMs: 0,
      tailWorker: "sfab-lite-check",
    },
    {
      log: () => undefined,
      sleep: () => Promise.resolve(),
      createApp: () => {
        calls.push("create");
        return Promise.resolve({ appId: "app_probe_ok" });
      },
      waitReady: () => {
        calls.push("ready");
        return Promise.resolve();
      },
      addRecipe: (_id, name) => {
        calls.push(`add:${name}`);
        return Promise.resolve();
      },
      readFile: () => Promise.resolve(SEED_INDEX),
      writeFile: () => {
        calls.push("mount");
        return Promise.resolve();
      },
      bash: (_id, command) => {
        calls.push(`bash:${command.split(" ")[0]}`);
        if (command === "git status") {
          return Promise.resolve({
            stdout: "modified     src/hono/org-protected/index.ts\n",
            exitCode: 0,
            passed: true,
          });
        }
        return Promise.resolve({ stdout: "ok\n", exitCode: 0, passed: true });
      },
      typecheckWarm: () => {
        calls.push("warm");
        return Promise.resolve({ passed: true, exitCode: 0 });
      },
      collectFiles: () => Promise.resolve({ "src/server.ts": "export {}" }),
      typecheckCold: () => {
        calls.push("cold");
        return Promise.resolve({ ok: true, publishGate: true, wallMs: 9000 });
      },
      startTail: () => {
        calls.push("tail-start");
        return Promise.resolve();
      },
      stopTail: () => {
        calls.push("tail-stop");
        return Promise.resolve([{ outcome: "ok", cpuTime: 900 }]);
      },
      deleteApp: (id) => {
        calls.push(`delete:${id}`);
        return Promise.resolve();
      },
    }
  );
  assert.equal(result.appId, "app_probe_ok");
  assert.equal(result.scored.kill, false);
  assert.ok(calls.includes("create"));
  assert.ok(calls.includes("add:lite/pdf-invoice"));
  assert.ok(calls.includes("mount"));
  assert.ok(calls.includes("warm"));
  assert.ok(calls.includes("cold"));
  assert.equal(calls.at(-1), "delete:app_probe_ok");
});

test("protected live M3 ERP and Pin2 ids are refused", () => {
  assert.equal(
    isProtectedApp({ id: [...NEVER_TOUCH_APP_IDS][0], name: "x" }),
    true
  );
  assert.equal(isProtectedApp({ id: "app_other", name: "M3 ERP" }), true);
  assert.equal(
    isProtectedApp({ id: "app_other", name: "probe-catalog" }),
    false
  );
});

test("glob file filter skips directories", () => {
  assert.deepEqual(
    filePathsFromGlob({
      paths: [
        { path: "/src/server.ts", type: "file" },
        { path: "/src", type: "directory" },
        "src/pdf/invoice.ts",
      ],
    }),
    ["/src/server.ts", "src/pdf/invoice.ts"]
  );
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
