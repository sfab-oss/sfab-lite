/**
 * Cheap-vs-real catalog stub agreement gate.
 *
 * Boundary files must be 0 diagnostics under the committed cheap surface and
 * the real package `.d.ts`. Plants must be caught on both. Surface members
 * must exist on the real types. Signature mismatches need a declared seam
 * with a why. Heap is recorded, not gated.
 *
 * Assignability is `const s: SurfaceT = realValue` per pin. Method-parameter
 * bivariance can hide a widened parameter; plants are the backstop.
 *
 *   NODE_OPTIONS=--max-old-space-size=8192 node scripts/run-measure.mjs check-catalog-agreement.ts
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { TYPES_VFS } from "@sfab-lite/kernel";
import {
  clientPrefixesFromManifest,
  createAppLsState,
  disposeService,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import ts from "typescript";
import { SEAMS as EXCELJS_SEAMS } from "../../../framework/modules/exceljs@4.4.0/seams.mjs";
import { SEAMS as PDF_LIB_SEAMS } from "../../../framework/modules/pdf-lib@1.17.1/seams.mjs";
import {
  CATALOG_PINS,
  pinSpec,
} from "../../../framework/modules/scripts/pins.mjs";
import { SEED_MANIFEST } from "./seed-manifest.ts";

interface CatalogPin {
  name: string;
  version: string;
  stubVfsPath: string;
  reexportDefault?: boolean;
}

interface Seam {
  name: string;
  why: string;
}

interface Plant {
  file: string;
  find: string;
  replace: string;
  expect: "error";
  sides?: "cheap" | "both";
}

interface RecipeTarget {
  name: string;
  pin: CatalogPin;
  dir: string;
  boundaryRel: string;
  plants: Plant[];
}

const repoRoot = join(process.cwd(), "../..");
const MODULES_ROOT = join(repoRoot, "framework/modules");
const RECIPES_ROOT = join(repoRoot, "registry/recipes");

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort((a, b) => a.localeCompare(b)),
];

const SEAMS_BY_PIN: Record<string, readonly Seam[]> = {
  "pdf-lib@1.17.1": PDF_LIB_SEAMS,
  "exceljs@4.4.0": EXCELJS_SEAMS,
};

const REQUIRED_PLANT_NEEDLES: Record<string, string[]> = {
  "lite/pdf-invoice": [
    "drawText(123",
    "embedFont(42)",
    'addPage("letter")',
    "setTitle(0)",
    'rgb("red"',
    "load(true)",
  ],
  "lite/xlsx-export": [
    "addWorksheet(1)",
    'writeBuffer("x")',
    "addRow(123)",
    "addRows(123)",
    "getCell(true)",
  ],
};

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const BARE_FROM_RE = /(?:from|import\(\s*)["']([^"']+)["']/g;
const LEADING_DOT_SLASH = /^\.\//;
const D_MTS_SUFFIX = /\.d\.mts$/;
const D_TS_SUFFIX = /\.d\.ts$/;
const SAVE_WHY_RE = /BodyInit|Response|#177/;

const pins = CATALOG_PINS as CatalogPin[];

function seamsForPin(spec: string): readonly Seam[] {
  return SEAMS_BY_PIN[spec] ?? [];
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function flattenMessage(text: string | ts.DiagnosticMessageChain): string {
  if (typeof text === "string") {
    return text;
  }
  const rest = (text.next ?? []).map(flattenMessage).join(" ");
  return rest ? `${text.messageText} ${rest}` : text.messageText;
}

function diagSummary(diags: readonly ts.Diagnostic[]): string[] {
  return diags.slice(0, 16).map((d) => {
    const msg = flattenMessage(d.messageText);
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

function readPlants(path: string): Plant[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  return raw.map((row, i) => {
    if (
      row == null ||
      typeof row !== "object" ||
      typeof (row as Plant).file !== "string" ||
      typeof (row as Plant).find !== "string" ||
      typeof (row as Plant).replace !== "string" ||
      (row as Plant).expect !== "error"
    ) {
      throw new Error(
        `${path}[${i}] is not a { file, find, replace, expect: "error" } plant`
      );
    }
    const sides = (row as Plant).sides;
    if (sides != null && sides !== "cheap" && sides !== "both") {
      throw new Error(`${path}[${i}] sides must be "cheap" or "both"`);
    }
    return row as Plant;
  });
}

function recipeDirs(): string[] {
  const out: string[] = [];
  if (!existsSync(RECIPES_ROOT)) {
    throw new Error(`missing ${RECIPES_ROOT}`);
  }
  for (const name of readdirSync(RECIPES_ROOT)) {
    const nameDir = join(RECIPES_ROOT, name);
    if (!statSync(nameDir).isDirectory()) {
      continue;
    }
    for (const ver of readdirSync(nameDir)) {
      const dir = join(nameDir, ver);
      if (
        statSync(dir).isDirectory() &&
        existsSync(join(dir, "plants.json")) &&
        existsSync(join(dir, "registry-item.json"))
      ) {
        out.push(dir);
      }
    }
  }
  return out;
}

function recipesForPin(pin: CatalogPin): RecipeTarget[] {
  const spec = pinSpec(pin);
  const out: RecipeTarget[] = [];
  for (const dir of recipeDirs()) {
    const item = JSON.parse(
      readFileSync(join(dir, "registry-item.json"), "utf8")
    ) as {
      name?: string;
      dependencies?: string[];
      files?: { path: string; target: string }[];
    };
    if (!item.dependencies?.includes(spec) || typeof item.name !== "string") {
      continue;
    }
    const plants = readPlants(join(dir, "plants.json"));
    const files = new Set(plants.map((p) => p.file));
    if (files.size !== 1) {
      throw new Error(
        `${item.name} plants must target exactly one boundary file`
      );
    }
    const boundaryRel = plants[0]?.file;
    if (!boundaryRel) {
      throw new Error(`${item.name} plants.json has no file`);
    }
    const needles = REQUIRED_PLANT_NEEDLES[item.name];
    if (!needles) {
      throw new Error(`no required plant needles registered for ${item.name}`);
    }
    const blob = plants.map((p) => p.replace).join("\n");
    const missing = needles.filter((n) => !blob.includes(n));
    if (missing.length > 0) {
      throw new Error(
        `${item.name} plants.json missing required needles: ${missing.join(", ")}`
      );
    }
    const mapped = (item.files ?? []).some((f) => f.target === boundaryRel);
    if (!mapped) {
      throw new Error(
        `${item.name} plants file ${boundaryRel} is not a registry-item target`
      );
    }
    out.push({
      name: item.name,
      pin,
      dir,
      boundaryRel,
      plants,
    });
  }
  if (out.length === 0) {
    throw new Error(`no published recipe depends on ${spec}`);
  }
  return out;
}

function loadBoundary(recipe: RecipeTarget): Record<string, string> {
  const item = JSON.parse(
    readFileSync(join(recipe.dir, "registry-item.json"), "utf8")
  ) as { files: { path: string; target: string }[] };
  const file = item.files.find((f) => f.target === recipe.boundaryRel);
  if (!file) {
    throw new Error(`${recipe.name} missing target ${recipe.boundaryRel}`);
  }
  return {
    [recipe.boundaryRel]: readFileSync(join(recipe.dir, file.path), "utf8"),
  };
}

function applyPlants(
  files: Record<string, string>,
  plants: Plant[]
): Record<string, string> {
  const next = { ...files };
  for (const plant of plants) {
    const src = next[plant.file];
    if (src == null) {
      throw new Error(`plant file missing from assembled tree: ${plant.file}`);
    }
    if (!src.includes(plant.find)) {
      throw new Error(`plant find missing in ${plant.file}: ${plant.find}`);
    }
    const replaced = src.replace(plant.find, plant.replace);
    if (replaced === src) {
      throw new Error(`plant did not change ${plant.file}: ${plant.find}`);
    }
    next[plant.file] = replaced;
  }
  return next;
}

function packageRootOf(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  const slash = specifier.indexOf("/");
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

function walkFiles(
  dir: string,
  visit: (abs: string, rel: string) => void
): void {
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules") {
      continue;
    }
    const abs = join(dir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walkFiles(abs, (childAbs, childRel) => {
        visit(childAbs, join(ent, childRel));
      });
    } else {
      visit(abs, ent);
    }
  }
}

function typesField(pkgDir: string): string {
  const pkg = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8")
  ) as {
    types?: string;
    typings?: string;
  };
  return (pkg.types ?? pkg.typings ?? "index.d.ts").replace(
    LEADING_DOT_SLASH,
    ""
  );
}

function collectPackageOverlay(
  nm: string,
  pkg: string,
  overlay: Map<string, string>
): void {
  const pkgDir = join(nm, pkg);
  if (!existsSync(pkgDir)) {
    throw new Error(`isolated install missing ${pkg} at ${pkgDir}`);
  }
  const typesRel = typesField(pkgDir);
  const typesAbs = join(pkgDir, typesRel);
  let walkRoot = pkgDir;
  if (existsSync(typesAbs) && typesRel.includes("/")) {
    walkRoot = join(pkgDir, typesRel.split("/")[0] ?? ".");
  }
  overlay.set(
    `/node_modules/${pkg}/package.json`,
    readFileSync(join(pkgDir, "package.json"), "utf8")
  );
  walkFiles(walkRoot, (abs, relFromWalk) => {
    if (
      !(
        relFromWalk.endsWith(".d.ts") ||
        relFromWalk.endsWith(".d.mts") ||
        relFromWalk.endsWith("package.json")
      )
    ) {
      return;
    }
    const rel =
      walkRoot === pkgDir
        ? relFromWalk
        : join(relative(pkgDir, walkRoot), relFromWalk);
    overlay.set(
      `/node_modules/${pkg}/${rel.replaceAll("\\", "/")}`,
      readFileSync(abs, "utf8")
    );
  });
  const indexPath = `/node_modules/${pkg}/index.d.ts`;
  if (!overlay.has(indexPath)) {
    const from = `./${typesRel.replace(D_MTS_SUFFIX, ".mjs").replace(D_TS_SUFFIX, ".js")}`;
    overlay.set(indexPath, `export * from "${from}";\n`);
  }
}

function extraPackagesFromOverlay(overlay: Map<string, string>): string[] {
  const pkgs = new Set<string>();
  for (const text of overlay.values()) {
    BARE_FROM_RE.lastIndex = 0;
    for (;;) {
      const m = BARE_FROM_RE.exec(text);
      if (!m) {
        break;
      }
      const spec = m[1] ?? "";
      if (
        spec.startsWith(".") ||
        spec.startsWith("node:") ||
        NODE_BUILTINS.has(spec) ||
        NODE_BUILTINS.has(packageRootOf(spec))
      ) {
        continue;
      }
      pkgs.add(packageRootOf(spec));
    }
  }
  return [...pkgs];
}

function collectRealOverlay(nm: string, pin: CatalogPin): Map<string, string> {
  const overlay = new Map<string, string>();
  collectPackageOverlay(nm, pin.name, overlay);
  for (const extra of extraPackagesFromOverlay(overlay)) {
    if (extra === pin.name) {
      continue;
    }
    const extraDir = join(nm, extra);
    if (!existsSync(extraDir)) {
      continue;
    }
    collectPackageOverlay(nm, extra, overlay);
  }
  if (!overlay.has(pin.stubVfsPath)) {
    throw new Error(`real overlay missing resolver entry ${pin.stubVfsPath}`);
  }
  return overlay;
}

function installPin(pin: CatalogPin): string {
  const isolated = join(
    tmpdir(),
    "sfab-catalog-agreement-pins",
    pinSpec(pin),
    "isolated"
  );
  const nm = join(isolated, "node_modules");
  const pkgJson = join(nm, pin.name, "package.json");
  if (existsSync(pkgJson)) {
    return nm;
  }
  rmSync(isolated, { recursive: true, force: true });
  mkdirSync(isolated, { recursive: true });
  writeFileSync(
    join(isolated, "package.json"),
    `${JSON.stringify({ name: `sfab-${pin.name}-isolated`, private: true }, null, 2)}\n`
  );
  const result = spawnSync(
    "npm",
    ["install", "--ignore-scripts", "--save-exact", pinSpec(pin)],
    { cwd: isolated, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`npm install ${pinSpec(pin)} failed`);
  }
  if (!existsSync(pkgJson)) {
    throw new Error(`npm install ${pinSpec(pin)} did not write ${pkgJson}`);
  }
  return nm;
}

function overlayAppFiles(
  st: ReturnType<typeof createAppLsState>,
  files: Record<string, string>
): void {
  for (const [path, text] of Object.entries(files)) {
    if (!(path.endsWith(".ts") || path.endsWith(".tsx"))) {
      continue;
    }
    const vfsPath = `/app/${path}`;
    st.overlay.set(vfsPath, text);
    st.versions.set(vfsPath, 1);
  }
}

function overlayCheap(
  st: ReturnType<typeof createAppLsState>,
  pin: CatalogPin,
  surface: string
): void {
  st.overlay.set(pin.stubVfsPath, surface);
  st.versions.set(pin.stubVfsPath, 1);
}

function overlayReal(
  st: ReturnType<typeof createAppLsState>,
  real: Map<string, string>
): void {
  for (const [path, text] of real) {
    st.overlay.set(path, text);
    st.versions.set(path, 1);
  }
}

interface MeasureRow {
  label: string;
  diagnostics: number;
  diagnosticSample: string[];
  loadedFiles: number;
  ms: number;
  heapRetainedMb: number;
  plantHits?: Record<string, boolean>;
}

function measureBoundary(opts: {
  label: string;
  files: Record<string, string>;
  boundaryRel: string;
  pin: CatalogPin;
  surface: "cheap" | "real";
  cheapText: string;
  real: Map<string, string>;
  plants?: Plant[];
}): MeasureRow {
  const before = heapMb();
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  overlayAppFiles(st, opts.files);
  if (opts.surface === "cheap") {
    overlayCheap(st, opts.pin, opts.cheapText);
  } else {
    overlayReal(st, opts.real);
  }
  const boundary = `/app/${opts.boundaryRel}`;
  st.rootFiles = [boundary, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);
  const t0 = Date.now();
  const diags = ls.getSemanticDiagnostics(boundary);
  const ms = Date.now() - t0;
  const program = ls.getProgram();
  const after = heapMb();
  const row: MeasureRow = {
    label: opts.label,
    diagnostics: diags.length,
    diagnosticSample: diagSummary(diags),
    loadedFiles: program ? program.getSourceFiles().length : 0,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  if (opts.plants) {
    const src = opts.files[opts.boundaryRel] ?? "";
    const hits: Record<string, boolean> = {};
    for (const plant of opts.plants) {
      hits[plant.replace] = diagHitsSpan(
        diags,
        plantSpan(src, plant.replace),
        boundary
      );
    }
    row.plantHits = hits;
  }
  disposeService(st);
  console.log(JSON.stringify(row));
  return row;
}

function exportedKeepType(
  checker: ts.TypeChecker,
  program: ts.Program,
  fileName: string
): ts.Type {
  const sf = program.getSourceFile(fileName);
  if (!sf) {
    throw new Error(`missing ${fileName}`);
  }
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) {
      continue;
    }
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === "keep") {
        return checker.getTypeAtLocation(decl.name);
      }
    }
  }
  throw new Error(`keep binding missing in ${fileName}`);
}

function typePaths(
  checker: ts.TypeChecker,
  type: ts.Type,
  prefix: string,
  depth: number,
  seen: Set<string>,
  out: string[]
): void {
  if (depth > 3) {
    return;
  }
  for (const prop of type.getProperties()) {
    const name = prop.getName();
    if (name.startsWith("__")) {
      continue;
    }
    const path = prefix ? `${prefix}.${name}` : name;
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    out.push(path);
    const pt = checker.getTypeOfSymbol(prop);
    for (const sig of pt.getConstructSignatures()) {
      typePaths(
        checker,
        sig.getReturnType(),
        `${path}()`,
        depth + 1,
        seen,
        out
      );
    }
    const nested = pt.getProperties().length;
    if (nested > 0 && nested < 50) {
      typePaths(checker, pt, path, depth + 1, seen, out);
    }
  }
}

function typeHasPath(
  checker: ts.TypeChecker,
  type: ts.Type,
  path: string
): boolean {
  const parts = path.split(".");
  let current: ts.Type | undefined = type;
  for (const raw of parts) {
    if (!current) {
      return false;
    }
    const isInst = raw.endsWith("()");
    const name = isInst ? raw.slice(0, -2) : raw;
    const prop = current.getProperty(name);
    if (!prop) {
      return false;
    }
    const pt = checker.getTypeOfSymbol(prop);
    current = isInst ? pt.getConstructSignatures()[0]?.getReturnType() : pt;
  }
  return true;
}

function programForOverlay(
  files: Record<string, string>,
  extraOverlay: Map<string, string>,
  roots: string[]
): {
  checker: ts.TypeChecker;
  program: ts.Program;
  st: ReturnType<typeof createAppLsState>;
} {
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  overlayAppFiles(st, files);
  for (const [path, text] of extraOverlay) {
    st.overlay.set(path, text);
    st.versions.set(path, 1);
  }
  st.rootFiles = [...roots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);
  for (const root of roots) {
    ls.getSemanticDiagnostics(root);
  }
  const program = ls.getProgram();
  if (!program) {
    throw new Error("LanguageService produced no program");
  }
  return { checker: program.getTypeChecker(), program, st };
}

function checkMemberExistence(
  pin: CatalogPin,
  cheapText: string,
  real: Map<string, string>
): { missing: string[]; checked: number } {
  const probe = pin.reexportDefault
    ? `import M from "${pin.name}";\nexport const keep = M;\n`
    : `import * as M from "${pin.name}";\nexport const keep = M;\n`;
  const files = { "src/__catalog_members.ts": probe };
  const cheapOverlay = new Map<string, string>([[pin.stubVfsPath, cheapText]]);
  const cheap = programForOverlay(files, cheapOverlay, [
    "/app/src/__catalog_members.ts",
  ]);
  const cheapType = exportedKeepType(
    cheap.checker,
    cheap.program,
    "/app/src/__catalog_members.ts"
  );
  const members: string[] = [];
  typePaths(cheap.checker, cheapType, "", 0, new Set(), members);
  const realProg = programForOverlay(files, real, [
    "/app/src/__catalog_members.ts",
  ]);
  const realType = exportedKeepType(
    realProg.checker,
    realProg.program,
    "/app/src/__catalog_members.ts"
  );
  const missing: string[] = [];
  for (const path of members) {
    if (!typeHasPath(realProg.checker, realType, path)) {
      missing.push(path);
    }
  }
  disposeService(cheap.st);
  disposeService(realProg.st);
  return { missing, checked: members.length };
}

function assignabilitySource(pin: CatalogPin): string {
  if (pin.reexportDefault) {
    return `import type Surface from "./__catalog_surface.d.ts";
import Real from "${pin.name}";
declare const real: typeof Real;
export const assign: typeof Surface = real;
`;
  }
  return `import type * as Surface from "./__catalog_surface.d.ts";
import * as Real from "${pin.name}";
declare const real: typeof Real;
export const assign: typeof Surface = real;
`;
}

function checkSeams(
  pin: CatalogPin,
  cheapText: string,
  real: Map<string, string>
): { undeclared: string[]; missingWhy: string[]; saveWhyOk: boolean } {
  const seams = seamsForPin(pinSpec(pin));
  const missingWhy = seams
    .filter((s) => !s.why || s.why.trim().length === 0)
    .map((s) => s.name);
  const files = {
    "src/__catalog_surface.d.ts": cheapText,
    "src/__catalog_assign.ts": assignabilitySource(pin),
  };
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  overlayAppFiles(st, files);
  overlayReal(st, real);
  const assignPath = "/app/src/__catalog_assign.ts";
  st.rootFiles = [
    assignPath,
    "/app/src/__catalog_surface.d.ts",
    ...AMBIENT_ROOTS,
  ];
  const ls = getLanguageService(st);
  const diags = ls.getSemanticDiagnostics(assignPath);
  const undeclared: string[] = [];
  for (const d of diags) {
    const msg = flattenMessage(d.messageText);
    const covered = seams.some((seam) => {
      const last = seam.name.split(".").at(-1) ?? seam.name;
      return last.length > 0 && msg.includes(last);
    });
    if (!covered) {
      undeclared.push(`TS${d.code}: ${msg}`);
    }
  }
  let saveWhyOk = true;
  if (cheapText.includes("Uint8Array<ArrayBuffer>")) {
    const saveSeam = seams.find((s) => s.name.includes("save"));
    if (!(saveSeam?.why && SAVE_WHY_RE.test(saveSeam.why))) {
      saveWhyOk = false;
    }
  }
  disposeService(st);
  return { undeclared, missingWhy, saveWhyOk };
}

function dropDrawText(surface: string): string {
  const needle = `  drawText(
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      font: PDFFont;
      color?: RGB;
    }
  ): void;
`;
  if (!surface.includes(needle)) {
    throw new Error(
      "red-test: drawText declaration missing from pdf-lib surface"
    );
  }
  const next = surface.replace(needle, "");
  if (next === surface) {
    throw new Error("red-test: drawText drop did not change the surface");
  }
  return next;
}

function widenEmbedFont(surface: string): string {
  const from = "embedFont(font: string)";
  const to = "embedFont(font: unknown)";
  if (!surface.includes(from)) {
    throw new Error(
      "red-test: embedFont(font: string) missing from pdf-lib surface"
    );
  }
  const next = surface.replace(from, to);
  if (next === surface) {
    throw new Error("red-test: embedFont widen did not change the surface");
  }
  return next;
}

const realByPin = new Map<string, Map<string, string>>();
const surfaceByPin = new Map<string, string>();

for (const pin of pins) {
  const spec = pinSpec(pin);
  const surfacePath = join(MODULES_ROOT, spec, "surface.d.ts");
  if (!existsSync(surfacePath)) {
    throw new Error(`missing surface ${surfacePath}`);
  }
  surfaceByPin.set(spec, readFileSync(surfacePath, "utf8"));
  console.log(JSON.stringify({ label: "install", pin: spec }));
  const nm = installPin(pin);
  const real = collectRealOverlay(nm, pin);
  realByPin.set(spec, real);
  console.log(
    JSON.stringify({
      label: "real-overlay",
      pin: spec,
      files: real.size,
    })
  );
}

let healthy0eq0 = true;
let plantCaughtBoth = true;
const memberMissing: string[] = [];
const seamFailures: string[] = [];
let heapCheapMb = 0;
let heapRealMb = 0;

for (const pin of pins) {
  const spec = pinSpec(pin);
  const cheapText = surfaceByPin.get(spec);
  const real = realByPin.get(spec);
  if (cheapText == null || real == null) {
    throw new Error(`missing surface/real for ${spec}`);
  }
  const recipes = recipesForPin(pin);
  for (const recipe of recipes) {
    const healthyFiles = loadBoundary(recipe);
    const brokenFiles = applyPlants(healthyFiles, recipe.plants);
    const cheapHealthy = measureBoundary({
      label: `${recipe.name} cheap healthy`,
      files: healthyFiles,
      boundaryRel: recipe.boundaryRel,
      pin,
      surface: "cheap",
      cheapText,
      real,
    });
    const realHealthy = measureBoundary({
      label: `${recipe.name} real healthy`,
      files: healthyFiles,
      boundaryRel: recipe.boundaryRel,
      pin,
      surface: "real",
      cheapText,
      real,
    });
    heapCheapMb = cheapHealthy.heapRetainedMb;
    heapRealMb = realHealthy.heapRetainedMb;
    if (cheapHealthy.diagnostics !== 0 || realHealthy.diagnostics !== 0) {
      healthy0eq0 = false;
    }
    const cheapBroken = measureBoundary({
      label: `${recipe.name} cheap plants`,
      files: brokenFiles,
      boundaryRel: recipe.boundaryRel,
      pin,
      surface: "cheap",
      cheapText,
      real,
      plants: recipe.plants,
    });
    const realBroken = measureBoundary({
      label: `${recipe.name} real plants`,
      files: brokenFiles,
      boundaryRel: recipe.boundaryRel,
      pin,
      surface: "real",
      cheapText,
      real,
      plants: recipe.plants,
    });
    for (const plant of recipe.plants) {
      const cheapHit = cheapBroken.plantHits?.[plant.replace] === true;
      const realHit = realBroken.plantHits?.[plant.replace] === true;
      const requireReal = plant.sides !== "cheap";
      if (!cheapHit || (requireReal && !realHit)) {
        plantCaughtBoth = false;
      }
    }
  }

  const members = checkMemberExistence(pin, cheapText, real);
  console.log(
    JSON.stringify({
      label: "members",
      pin: spec,
      checked: members.checked,
      missing: members.missing,
    })
  );
  for (const m of members.missing) {
    memberMissing.push(`${spec} ${m}`);
  }

  const seams = checkSeams(pin, cheapText, real);
  console.log(
    JSON.stringify({
      label: "seams",
      pin: spec,
      undeclared: seams.undeclared,
      missingWhy: seams.missingWhy,
      saveWhyOk: seams.saveWhyOk,
    })
  );
  for (const u of seams.undeclared) {
    seamFailures.push(`${spec} undeclared: ${u}`);
  }
  for (const w of seams.missingWhy) {
    seamFailures.push(`${spec} missing why: ${w}`);
  }
  if (!seams.saveWhyOk) {
    seamFailures.push(
      `${spec} PDFDocument.save seam why must cite #177 hosted Response / BodyInit`
    );
  }
}

const pdfPin = pins.find((p) => p.name === "pdf-lib");
if (!pdfPin) {
  throw new Error("pdf-lib pin missing from catalog allowlist");
}
const pdfSurface = surfaceByPin.get(pinSpec(pdfPin));
const pdfReal = realByPin.get(pinSpec(pdfPin));
if (pdfSurface == null || pdfReal == null) {
  throw new Error("pdf-lib surface/real missing");
}
const pdfRecipe = recipesForPin(pdfPin)[0];
if (!pdfRecipe) {
  throw new Error("pdf-invoice recipe missing");
}
const healthyPdf = loadBoundary(pdfRecipe);
const dropped = dropDrawText(pdfSurface);
const dropRow = measureBoundary({
  label: "red-test drop drawText cheap healthy",
  files: healthyPdf,
  boundaryRel: pdfRecipe.boundaryRel,
  pin: pdfPin,
  surface: "cheap",
  cheapText: dropped,
  real: pdfReal,
});
const dropCaught = dropRow.diagnostics > 0;

const widened = widenEmbedFont(pdfSurface);
const brokenPdf = applyPlants(healthyPdf, pdfRecipe.plants);
const widenRow = measureBoundary({
  label: "red-test widen embedFont cheap plants",
  files: brokenPdf,
  boundaryRel: pdfRecipe.boundaryRel,
  pin: pdfPin,
  surface: "cheap",
  cheapText: widened,
  real: pdfReal,
  plants: pdfRecipe.plants,
});
const embedPlant = pdfRecipe.plants.find((p) =>
  p.replace.includes("embedFont(42)")
);
if (!embedPlant) {
  throw new Error("embedFont(42) plant missing");
}
const widenCaught = widenRow.plantHits?.[embedPlant.replace] !== true;

const pass =
  healthy0eq0 &&
  plantCaughtBoth &&
  memberMissing.length === 0 &&
  seamFailures.length === 0 &&
  dropCaught &&
  widenCaught;

const verdict = {
  label: "agreement",
  healthy0eq0,
  plantCaughtBoth,
  memberMissing,
  seamFailures,
  dropMemberCaught: dropCaught,
  widenParamCaught: widenCaught,
  heapCheapMb,
  heapRealMb,
  heapNote:
    "Heap is recorded, not gated. Contract is 0=0, plants, members, seams, and red tests.",
  pass,
};
console.log(JSON.stringify(verdict));
if (!pass) {
  process.exit(1);
}
