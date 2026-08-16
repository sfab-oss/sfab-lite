/**
 * Behavioural proof for check units: snapshot emit, hash freshness, planted
 * server/client errors. Bundled by the companion .mjs runner.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  type LsStore,
  liveLanguageServices,
  overlayAppPath,
  runCheck,
  serverImportClosure,
  snapshotFreshnessDiagnostic,
} from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const API_DTS = "src/generated/api.d.ts";
const API_HASH = "src/generated/api.hash";

const baseFiles: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".css") ||
    path.endsWith(".d.ts") ||
    path.endsWith(".hash")
  ) {
    baseFiles[path] = text;
  }
}

const store: LsStore = new Map();
let failed = false;

function check(label: string, files: Record<string, string>) {
  const result = runCheck(
    {
      appId: `units-${label}`,
      files,
      manifest: SEED_MANIFEST,
      forceCold: true,
    },
    { store }
  );
  console.log(
    JSON.stringify({
      label,
      diagnosticCount: result.diagnosticCount,
      diagnostics: result.diagnostics,
      units: result.units,
      emitted: result.emittedFiles ? Object.keys(result.emittedFiles) : [],
      serverTreeHash: result.serverTreeHash,
    })
  );
  if (liveLanguageServices(store) !== 0) {
    fail(`LanguageService still live after ${label}`);
  }
  return result;
}

function fail(msg: string): void {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

{
  const overlay = new Map<string, string>([
    [
      overlayAppPath("src/server.ts"),
      'import "./side";\nexport const app = 1;\n',
    ],
    [overlayAppPath("src/side.ts"), "export const n = 1;\n"],
  ]);
  const closure = serverImportClosure(overlay, "src/server.ts");
  if (!closure.includes(overlayAppPath("src/side.ts"))) {
    fail("bare side-effect import must be in the server-tree hash closure");
  }
}

const named = snapshotFreshnessDiagnostic("sha256:expected", "sha256:got");
if (
  named.code !== 9001 ||
  !named.message.includes("LITE-SNAPSHOT") ||
  !named.message.includes("sha256:expected") ||
  !named.message.includes("The client was not checked")
) {
  fail("named stale-hash diagnostic must be LITE-SNAPSHOT with both hashes");
}

const healthy = check("healthy-seed", baseFiles);
if (healthy.diagnosticCount !== 0) {
  fail(`seed must be clean (${healthy.diagnosticCount} diagnostics)`);
}
const seedDts = baseFiles[API_DTS] ?? "";
if (!seedDts) {
  fail("seed must include src/generated/api.d.ts");
}
if (
  /drizzle/i.test(seedDts) ||
  /hono\/index/.test(seedDts) ||
  /\bAppEnv\b/.test(seedDts)
) {
  fail("snapshot must be standalone (no drizzle / hono/index / AppEnv)");
}
if (
  !(seedDts.includes('"/health"') && seedDts.includes('"/protected/parties"'))
) {
  fail("snapshot must include /health and /protected/parties");
}
if (seedDts.includes("$all") || seedDts.includes("/auth")) {
  fail("snapshot must omit auth wildcard / $all routes");
}
const serverUnit = healthy.units?.find((u) => u.unit === "server");
const emitUnit = healthy.units?.find((u) => u.unit === "emit");
const clientUnit = healthy.units?.find((u) => u.unit === "client");
if (
  !serverUnit ||
  serverUnit.skipped ||
  !emitUnit ||
  !clientUnit ||
  clientUnit.skipped
) {
  fail("healthy matching snapshot must run server + client");
}
if (emitUnit != null && emitUnit.skipped !== true) {
  fail("healthy matching snapshot must skip emit");
}
if (healthy.emittedFiles && Object.keys(healthy.emittedFiles).length > 0) {
  fail("skipped emit must not rewrite the snapshot");
}

const { [API_HASH]: _hash, ...coldFiles } = baseFiles;
const cold = check("cold-emit", coldFiles);
if (!cold.emittedFiles?.[API_DTS]) {
  fail("cold emit must write src/generated/api.d.ts");
}
if (!cold.emittedFiles?.[API_HASH]?.startsWith("sha256:")) {
  fail("cold emit must write sha256: api.hash");
}
if (cold.units?.find((u) => u.unit === "emit")?.skipped) {
  fail("missing hash must run emit");
}
if (process.env.WRITE_SNAPSHOT === "1" && cold.emittedFiles) {
  const appSrc = join(repoRoot, "starters/erp/app");
  writeFileSync(join(appSrc, API_DTS), cold.emittedFiles[API_DTS] ?? "");
  writeFileSync(join(appSrc, API_HASH), cold.emittedFiles[API_HASH] ?? "");
  console.log("wrote starter snapshot from cold emit");
}

const partiesPath = "src/hono/org-protected/parties.ts";
const warm = check("warm-leaf-emit", {
  ...baseFiles,
  [partiesPath]: `${baseFiles[partiesPath] ?? ""}\n`,
});
if (warm.diagnosticCount !== 0) {
  fail(`warm leaf emit must stay clean (${warm.diagnosticCount} diagnostics)`);
}
if (warm.units?.find((u) => u.unit === "emit")?.skipped) {
  fail("a changed leaf route must re-emit");
}
const warmDts = warm.emittedFiles?.[API_DTS] ?? "";
if (
  !(warmDts.includes('"/health"') && warmDts.includes('"/protected/parties"'))
) {
  fail("prefix-merge must keep /health and /protected/parties");
}

const healthyParties = baseFiles[partiesPath] ?? "";
const brokenParties = healthyParties
  .replace("eq(party.id, id)", "eq(party.id, 0)")
  .replace("name: input.name,", "name: 123,");
if (brokenParties === healthyParties) {
  fail("broken overlay did not change parties.ts");
} else {
  const plantedServer = check("planted-server", {
    ...baseFiles,
    [partiesPath]: brokenParties,
  });
  const serverFailed = plantedServer.units?.find((u) => u.unit === "server");
  const emitSkipped = plantedServer.units?.find((u) => u.unit === "emit");
  if (plantedServer.diagnosticCount === 0) {
    fail("planted server error must be reported");
  }
  if (
    plantedServer.emittedFiles &&
    Object.keys(plantedServer.emittedFiles).length > 0
  ) {
    fail("planted server error must stop emit");
  }
  if (serverFailed && serverFailed.diagnosticCount === 0) {
    fail("server unit must carry the planted error");
  }
  if (
    emitSkipped &&
    emitSkipped.skipped !== true &&
    emitSkipped.diagnosticCount === 0
  ) {
    fail("emit must not run after a server failure");
  }
  const clientRan = plantedServer.units?.find(
    (u) =>
      u.unit === "client" &&
      u.skipped !== true &&
      (u.checkMs > 0 || u.rootFileCount > 0)
  );
  if (clientRan) {
    fail("client must not run after a planted server error");
  }
}

const clientPlant = check("planted-client", {
  ...baseFiles,
  "src/lib/snapshot-plant.ts": `export const n: number = "nope";\n`,
});
if (clientPlant.diagnosticCount === 0) {
  fail("planted client error must be caught against a fresh snapshot");
}
if (clientPlant.units?.find((u) => u.unit === "client")?.skipped) {
  fail("planted client error must run the client unit");
}
const clientHit = clientPlant.diagnostics.some(
  (d) => d.code === 2322 && (d.file?.includes("snapshot-plant.ts") ?? false)
);
if (!clientHit) {
  fail("planted client error must surface TS2322 on the planted file");
}

const staleFiles: Record<string, string> = {
  "src/lib/client-stale.ts": `export const n: number = "nope";\n`,
  [API_DTS]: `export type ApiType = import("hono").Hono<any, {}>;\n`,
  [API_HASH]: "sha256:deadbeef",
};
const stale = check("stale-hash-no-server-entry", staleFiles);
const staleHit = stale.diagnostics.some(
  (d) =>
    d.message.includes("LITE-SNAPSHOT") &&
    d.message.includes("The client was not checked")
);
if (!staleHit) {
  fail("mismatched hash must fail with the named LITE-SNAPSHOT diagnostic");
}
const staleClient = stale.diagnostics.some(
  (d) => d.file?.includes("client-stale.ts") ?? false
);
if (staleClient) {
  fail("stale-hash refusal must not run the client unit");
}

if (failed) {
  process.exit(1);
}
console.log("PASS: check-units behavioural proof");
