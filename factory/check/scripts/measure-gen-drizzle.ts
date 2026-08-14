/**
 * Historical measure: generated cheap drizzle vs handwritten overlay vs real
 * VFS. The CI contract is `check:drizzle-agreement` (runtime seam table +
 * committed types-pack artifact). This script keeps the handwritten heap
 * comparison from the spike.
 *
 *   node scripts/run-measure.mjs measure-gen-drizzle.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import type ts from "typescript";
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";
import { DRIZZLE_TYPED } from "./experiment-overlays.ts";

const SERVER_ENTITIES = "/app/src/hono/org-protected/entities.ts";
const DRIZZLE_PREFIX = "/node_modules/drizzle-orm";
const SURFACE_PATH = join(
  process.cwd(),
  "../../framework/runtime/src/generated/types-pack/drizzle-orm.d.ts"
);

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort((a, b) => a.localeCompare(b)),
];

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

const healthyEntities = files[SERVER_ENTITIES] ?? "";
const brokenEntities = healthyEntities
  .replace("eq(entity.id, id)", "eq(entity.id, 0)")
  .replace("name: input.name,", "name: 123,");

if (brokenEntities === healthyEntities) {
  throw new Error("broken overlay did not change entities.ts");
}

const drizzleAppFiles = Object.keys(files)
  .filter((p) => files[p]?.includes("drizzle-orm"))
  .sort((a, b) => a.localeCompare(b));

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

function diagSummary(diags: readonly ts.Diagnostic[]): string[] {
  return diags.slice(0, 16).map((d) => {
    const msg =
      typeof d.messageText === "string"
        ? d.messageText
        : d.messageText.messageText;
    const file = d.file?.fileName ?? "";
    let loc = "";
    if (d.file && d.start != null) {
      const pos = d.file.getLineAndCharacterOfPosition(d.start);
      loc = `:${pos.line + 1}`;
    }
    return `${file}${loc} TS${d.code}: ${msg}`;
  });
}

function overlayDrizzle(
  overlay: Map<string, string>,
  versions: Map<string, number>,
  text: string | null
): number {
  if (text === null) {
    return 0;
  }
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    if (matchesPrefix(key, DRIZZLE_PREFIX)) {
      overlay.set(key, text);
      versions.set(key, 1);
      n += 1;
    }
  }
  return n;
}

const PLANT_CODE_RE = /TS2345|TS2322|TS2769/;
const PLANT_TEXT_RE = /number.*string|string.*number|overload/i;

function plantCatches(diags: readonly ts.Diagnostic[]): boolean {
  const texts = diags.map((d) => {
    const msg =
      typeof d.messageText === "string"
        ? d.messageText
        : d.messageText.messageText;
    return `TS${d.code}: ${msg}`;
  });
  const joined = texts.join("\n");
  return (
    diags.length > 0 &&
    (PLANT_CODE_RE.test(joined) || PLANT_TEXT_RE.test(joined))
  );
}

interface MeasureRow {
  label: string;
  stubbedFiles: number;
  loadedFiles: number;
  diagnostics: number;
  diagnosticSample: string[];
  ms: number;
  heapRetainedMb: number;
  plantCaught?: boolean;
}

function measure(
  label: string,
  drizzleText: string | null,
  entitiesSrc: string,
  extraRoots: string[]
): MeasureRow {
  const before = heapMb();
  const st = createAppLsState();
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  st.overlay.set(SERVER_ENTITIES, entitiesSrc);
  st.versions.set(SERVER_ENTITIES, 1);
  const stubbedFiles = overlayDrizzle(st.overlay, st.versions, drizzleText);
  const roots = new Set([SERVER_ENTITIES, ...AMBIENT_ROOTS, ...extraRoots]);
  st.rootFiles = [...roots];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const seen = new Set<string>();
  const diags: ts.Diagnostic[] = [];
  for (const root of [SERVER_ENTITIES, ...extraRoots]) {
    if (seen.has(root)) {
      continue;
    }
    seen.add(root);
    diags.push(...ls.getSemanticDiagnostics(root));
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const after = heapMb();
  const row: MeasureRow = {
    label,
    stubbedFiles,
    loadedFiles: sfs.length,
    diagnostics: diags.length,
    diagnosticSample: diagSummary(diags),
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  if (entitiesSrc === brokenEntities) {
    row.plantCaught = plantCatches(diags);
  }
  console.log(JSON.stringify(row));
  return row;
}

const genText = readFileSync(SURFACE_PATH, "utf8");
console.log(
  JSON.stringify({
    label: "generator",
    generatedBytes: genText.length,
    handwrittenBytes: DRIZZLE_TYPED.length,
    artifact: "framework/runtime/src/generated/types-pack/drizzle-orm.d.ts",
  })
);

const entitiesOnly: string[] = [];
const drizzleRoots = drizzleAppFiles;

const realHealthy = measure(
  "entities, real VFS",
  null,
  healthyEntities,
  entitiesOnly
);
const handHealthy = measure(
  "entities, handwritten typed",
  DRIZZLE_TYPED,
  healthyEntities,
  entitiesOnly
);
const genHealthy = measure(
  "entities, generated",
  genText,
  healthyEntities,
  entitiesOnly
);

const realBroken = measure(
  "broken entities, real VFS",
  null,
  brokenEntities,
  entitiesOnly
);
const genBroken = measure(
  "broken entities, generated",
  genText,
  brokenEntities,
  entitiesOnly
);

const handServer = measure(
  "drizzle-using server files, handwritten",
  DRIZZLE_TYPED,
  healthyEntities,
  drizzleRoots
);
const realServer = measure(
  "drizzle-using server files, real VFS",
  null,
  healthyEntities,
  drizzleRoots
);
const genServer = measure(
  "drizzle-using server files, generated",
  genText,
  healthyEntities,
  drizzleRoots
);

const healthyAgree =
  realHealthy.diagnostics === 0 && genHealthy.diagnostics === 0;
const serverAgree = realServer.diagnostics === 0 && genServer.diagnostics === 0;
const plantAgree = Boolean(realBroken.plantCaught && genBroken.plantCaught);
const heapDelta = Math.abs(
  genHealthy.heapRetainedMb - handHealthy.heapRetainedMb
);
const heapOk = heapDelta <= 15;

const verdict = {
  label: "agreement",
  healthy0eq0: healthyAgree,
  serverDiagHandwritten: handServer.diagnostics,
  serverDiagReal: realServer.diagnostics,
  serverDiagGenerated: genServer.diagnostics,
  serverAgree,
  plantCaughtBoth: plantAgree,
  heapGeneratedMb: genHealthy.heapRetainedMb,
  heapHandwrittenMb: handHealthy.heapRetainedMb,
  heapDeltaMb: heapDelta,
  heapNearHandwritten: heapOk,
  pass: healthyAgree && plantAgree && heapOk && serverAgree,
  result: "works-with-seams",
};

console.log(JSON.stringify(verdict));
if (!verdict.pass) {
  process.exit(1);
}
