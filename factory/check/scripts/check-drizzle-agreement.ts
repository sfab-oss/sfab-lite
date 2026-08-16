/**
 * Cheap-vs-real drizzle agreement gate (verdict parity + planted-error red
 * tests). Heap is recorded, not a CI fail — diag parity and the specific
 * plants are the contract.
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 node scripts/run-measure.mjs check-drizzle-agreement.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  clientPrefixesFromManifest,
  createAppLsState,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import type ts from "typescript";
import { SEAM_NAMES } from "../../../framework/runtime/scripts/drizzle-seams.mjs";
import { isDrizzleDeclVfsPath } from "../../../framework/runtime/scripts/served-specifiers.mjs";
import {
  isTrimTarget,
  trimDrizzleDialects,
} from "../../../framework/runtime/scripts/trim-drizzle-dialects.mjs";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const repoRoot = join(process.cwd(), "../..");
const TEMPLATE_SRC = join(repoRoot, "starters/erp/app/src");
const UNIVERSE_NM = join(repoRoot, "framework/runtime/universe/node_modules");
const SURFACE_PATH = join(
  repoRoot,
  "framework/runtime/src/generated/types-pack/drizzle-orm.d.ts"
);

const SERVER_PARTIES = "/app/src/hono/org-protected/parties.ts";
const EQ_PLANT = "eq(party.id, 0)";
const NAME_PLANT = "name: 123,";

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

const healthyParties = files[SERVER_PARTIES] ?? "";
const brokenParties = healthyParties
  .replace("eq(party.id, id)", EQ_PLANT)
  .replace("name: input.name,", NAME_PLANT);

if (brokenParties === healthyParties) {
  throw new Error("broken overlay did not change parties.ts");
}
if (!brokenParties.includes(EQ_PLANT)) {
  throw new Error(`eq plant missing from broken parties: ${EQ_PLANT}`);
}
if (!brokenParties.includes(NAME_PLANT)) {
  throw new Error(`name plant missing from broken parties: ${NAME_PLANT}`);
}

const drizzleAppFiles = Object.keys(files)
  .filter((p) => files[p]?.includes("drizzle-orm"))
  .sort((a, b) => a.localeCompare(b));

const generatedText = readFileSync(SURFACE_PATH, "utf8");

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:\{([^}]+)\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](drizzle-orm(?:\/[^"']+)?)["']/g;
const TYPE_PREFIX_RE = /^type\s+/;
const AS_SPLIT_RE = /\s+as\s+/;
const SEAM_SET = new Set(SEAM_NAMES);

function namedImports(clause: string): string[] {
  return clause
    .split(",")
    .map((part) => {
      const bit = part.trim();
      if (!bit || bit.startsWith("type ")) {
        const inner = bit.replace(TYPE_PREFIX_RE, "").trim();
        const as = inner.split(AS_SPLIT_RE);
        return (as[0] ?? "").trim();
      }
      const as = bit.split(AS_SPLIT_RE);
      return (as[0] ?? "").trim();
    })
    .filter((n) => n && n !== "type");
}

function walkTs(dir: string, out: string[]): void {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkTs(p, out);
    } else if (ent.endsWith(".ts") || ent.endsWith(".tsx")) {
      out.push(p);
    }
  }
}

function usageScan(): { file: string; specifier: string; names: string[] }[] {
  const tsFiles: string[] = [];
  walkTs(TEMPLATE_SRC, tsFiles);
  const hits: { file: string; specifier: string; names: string[] }[] = [];
  for (const file of tsFiles) {
    const text = readFileSync(file, "utf8");
    IMPORT_RE.lastIndex = 0;
    for (;;) {
      const m = IMPORT_RE.exec(text);
      if (!m) {
        break;
      }
      const names = m[1] ? namedImports(m[1]) : [];
      if (names.length === 0) {
        continue;
      }
      hits.push({
        file: relative(TEMPLATE_SRC, file),
        specifier: m[2] ?? "drizzle-orm",
        names,
      });
    }
  }
  return hits;
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
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

function plantSpan(
  src: string,
  needle: string
): { start: number; end: number } {
  const start = src.indexOf(needle);
  if (start < 0) {
    throw new Error(`plant needle missing: ${needle}`);
  }
  return { start, end: start + needle.length };
}

function valuesCallSpan(
  src: string,
  namePlant: string
): { start: number; end: number } {
  const nameStart = src.indexOf(namePlant);
  if (nameStart < 0) {
    throw new Error(`plant needle missing: ${namePlant}`);
  }
  const valuesStart = src.lastIndexOf(".values(", nameStart);
  if (valuesStart < 0) {
    throw new Error("name plant is not inside a .values() call");
  }
  const open = src.indexOf("{", valuesStart);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start: valuesStart, end: i + 1 };
      }
    }
  }
  throw new Error("unterminated .values() around name plant");
}

function diagHitsSpan(
  diags: readonly ts.Diagnostic[],
  span: { start: number; end: number },
  fileName: string
): boolean {
  return diags.some((d) => {
    if (d.file?.fileName !== fileName || d.start == null) {
      return false;
    }
    return d.start >= span.start && d.start < span.end;
  });
}

function overlayGenerated(
  overlay: Map<string, string>,
  versions: Map<string, number>
): number {
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    if (isDrizzleDeclVfsPath(key)) {
      overlay.set(key, generatedText);
      versions.set(key, 1);
      n += 1;
    }
  }
  return n;
}

function overlayReal(
  overlay: Map<string, string>,
  versions: Map<string, number>
): number {
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    if (!isDrizzleDeclVfsPath(key)) {
      continue;
    }
    const abs = join(UNIVERSE_NM, key.slice("/node_modules/".length));
    if (!existsSync(abs)) {
      throw new Error(`real drizzle missing for ${key} at ${abs}`);
    }
    let text = readFileSync(abs, "utf8");
    if (isTrimTarget(abs)) {
      text = trimDrizzleDialects(text);
    }
    overlay.set(key, text);
    versions.set(key, 1);
    n += 1;
  }
  return n;
}

interface MeasureRow {
  label: string;
  stubbedFiles: number;
  loadedFiles: number;
  diagnostics: number;
  diagnosticSample: string[];
  ms: number;
  heapRetainedMb: number;
  plantEq?: boolean;
  plantName?: boolean;
}

function measure(
  label: string,
  surface: "real" | "generated",
  partiesSrc: string,
  extraRoots: string[]
): MeasureRow {
  const before = heapMb();
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  st.overlay.set(SERVER_PARTIES, partiesSrc);
  st.versions.set(SERVER_PARTIES, 1);
  const stubbedFiles =
    surface === "generated"
      ? overlayGenerated(st.overlay, st.versions)
      : overlayReal(st.overlay, st.versions);
  const roots = new Set([SERVER_PARTIES, ...AMBIENT_ROOTS, ...extraRoots]);
  st.rootFiles = [...roots];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const seen = new Set<string>();
  const diags: ts.Diagnostic[] = [];
  for (const root of [SERVER_PARTIES, ...extraRoots]) {
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
  if (partiesSrc === brokenParties) {
    const eqSpan = plantSpan(partiesSrc, EQ_PLANT);
    const nameSpan = valuesCallSpan(partiesSrc, NAME_PLANT);
    row.plantEq = diagHitsSpan(diags, eqSpan, SERVER_PARTIES);
    row.plantName = diagHitsSpan(diags, nameSpan, SERVER_PARTIES);
  }
  console.log(JSON.stringify(row));
  return row;
}

const usage = usageScan();
const usedNames = [...new Set(usage.flatMap((u) => u.names))].sort((a, b) =>
  a.localeCompare(b)
);
const missingSeams = usedNames.filter((n) => !SEAM_SET.has(n));
console.log(
  JSON.stringify({
    label: "usage",
    usedNames,
    missingSeams,
    usageFiles: [...new Set(usage.map((u) => u.file))].sort((a, b) =>
      a.localeCompare(b)
    ),
    generatedBytes: generatedText.length,
  })
);
if (missingSeams.length > 0) {
  throw new Error(
    `starter imports drizzle names with no seam: ${missingSeams.join(", ")}`
  );
}

const partiesOnly: string[] = [];
const drizzleRoots = drizzleAppFiles;

const realHealthy = measure(
  "parties, real VFS",
  "real",
  healthyParties,
  partiesOnly
);
const genHealthy = measure(
  "parties, generated",
  "generated",
  healthyParties,
  partiesOnly
);

const realBroken = measure(
  "broken parties, real VFS",
  "real",
  brokenParties,
  partiesOnly
);
const genBroken = measure(
  "broken parties, generated",
  "generated",
  brokenParties,
  partiesOnly
);

const realServer = measure(
  "drizzle-using server files, real VFS",
  "real",
  healthyParties,
  drizzleRoots
);
const genServer = measure(
  "drizzle-using server files, generated",
  "generated",
  healthyParties,
  drizzleRoots
);

const healthyAgree =
  realHealthy.diagnostics === 0 && genHealthy.diagnostics === 0;
const serverAgree = realServer.diagnostics === 0 && genServer.diagnostics === 0;
const plantEqBoth = Boolean(realBroken.plantEq && genBroken.plantEq);
const plantNameBoth = Boolean(realBroken.plantName && genBroken.plantName);

const verdict = {
  label: "agreement",
  healthy0eq0: healthyAgree,
  serverDiagReal: realServer.diagnostics,
  serverDiagGenerated: genServer.diagnostics,
  serverAgree,
  plantEqBoth,
  plantNameBoth,
  plantCaughtBoth: plantEqBoth && plantNameBoth,
  heapGeneratedMb: genHealthy.heapRetainedMb,
  heapRealMb: realHealthy.heapRetainedMb,
  heapDeltaVsRealMb: Math.abs(
    genHealthy.heapRetainedMb - realHealthy.heapRetainedMb
  ),
  heapNote:
    "Heap is recorded, not gated. Contract is diag parity + specific plants.",
  pass: healthyAgree && serverAgree && plantEqBoth && plantNameBoth,
};

console.log(JSON.stringify(verdict));
if (!verdict.pass) {
  process.exit(1);
}
