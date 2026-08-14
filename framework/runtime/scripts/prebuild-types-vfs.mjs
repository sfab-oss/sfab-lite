/**
 * Types VFS for the check worker's TypeScript LanguageService.
 *
 * Prunes to the TypeScript program closure of synthetic roots that import
 * every specifier in CLIENT_IMPORT_MAP ∪ SERVER_IMPORT_MAP (the served
 * surface), not whole-package .d.ts dumps and not the starter's program.
 * Keeps DOM/ES libs + Cloudflare ambient from @sfab-lite/core.
 *
 * Module resolution for bare specifiers is forced through the isolated
 * kernel universe (framework/runtime/universe) so workspace peers cannot
 * leak into the VFS.
 *
 * Emits src/generated/types-vfs.js + results/types-vfs-sizes.json.
 * Export shape is a contract for factory/check: TYPES_VFS + TYPES_VFS_MANIFEST.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  GENERATED_SURFACE_ABS,
  isDrizzleDeclVfsPath,
} from "./gen-drizzle-surface.mjs";
import { PINS } from "./pins.mjs";
import { SERVER_IMPORT_MAP } from "./served-specifiers.mjs";
import { isTrimTarget, trimDrizzleDialects } from "./trim-drizzle-dialects.mjs";
import {
  getUniverseRequire,
  universeNodeModules,
  universeResolveContainingFile,
  universeRoot,
} from "./universe.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreAmbient = join(
  root,
  "..",
  "toolchain",
  "src",
  "cloudflare-ambient.d.ts"
);
const generatedDir = join(root, "src", "generated");
const require = getUniverseRequire();
const ts = require("typescript");

mkdirSync(join(root, "results"), { recursive: true });
mkdirSync(generatedDir, { recursive: true });

/** @type {Record<string, string>} */
const vfs = {};
/** @type {Record<string, number>} */
const packageTypeCounts = {};

function putText(vfsPath, text) {
  vfs[vfsPath.replaceAll("\\", "/")] = text;
}

function putFile(vfsPath, absPath) {
  putText(vfsPath, readFileSync(absPath, "utf8"));
}

/** Stable JSON for committed artifacts (sorted object keys). */
function stableStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, v[k]])
      );
    }
    return v;
  });
}

const tsDir = dirname(require.resolve("typescript"));
const tsPkgRoot = existsSync(join(tsDir, "package.json"))
  ? tsDir
  : dirname(tsDir);
const tsLib = join(tsPkgRoot, "lib");

function collectLibClosure(entryLib) {
  const seen = new Set();
  function walk(name) {
    if (seen.has(name)) {
      return;
    }
    const abs = join(tsLib, name);
    if (!existsSync(abs)) {
      return;
    }
    seen.add(name);
    const text = readFileSync(abs, "utf8");
    vfs[`/libs/${name}`] = text;
    for (const m of text.matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"/g)) {
      walk(`lib.${m[1]}.d.ts`);
    }
  }
  walk(entryLib);
  return [...seen];
}

const libFilesEs = collectLibClosure("lib.es2022.d.ts");
const libFilesDom = collectLibClosure("lib.dom.d.ts");
collectLibClosure("lib.dom.iterable.d.ts");
const libFiles = [
  ...new Set([...libFilesEs, ...libFilesDom, "lib.dom.iterable.d.ts"]),
];
putFile("/libs/lib.es2022.full.d.ts", join(tsLib, "lib.es2022.d.ts"));

vfs["/types/libs-ref.d.ts"] = `
/// <reference path="/libs/lib.es2022.d.ts" />
/// <reference path="/libs/lib.dom.d.ts" />
/// <reference path="/libs/lib.dom.iterable.d.ts" />
`.trim();

function loadClientImportMap() {
  const sizesPath = join(root, "results", "client-kernel-sizes.json");
  if (existsSync(sizesPath)) {
    const parsed = JSON.parse(readFileSync(sizesPath, "utf8"));
    if (parsed.importMap && typeof parsed.importMap === "object") {
      return parsed.importMap;
    }
  }
  const clientKernel = join(generatedDir, "client-kernel.js");
  if (!existsSync(clientKernel)) {
    throw new Error(
      "types VFS: CLIENT_IMPORT_MAP missing — run prebuild-client.mjs first"
    );
  }
  const src = readFileSync(clientKernel, "utf8");
  const match = src.match(/export const CLIENT_IMPORT_MAP = (\{[^\n]*\});/);
  if (!match) {
    throw new Error(
      "types VFS: could not parse CLIENT_IMPORT_MAP from client-kernel.js"
    );
  }
  return JSON.parse(match[1]);
}

function listServedSpecifiers() {
  const clientMap = loadClientImportMap();
  return [
    ...new Set([...Object.keys(clientMap), ...Object.keys(SERVER_IMPORT_MAP)]),
  ].sort((a, b) => a.localeCompare(b));
}

const SYNTHETIC_ROOT = join(universeRoot, "_served_surface.ts");

function syntheticSource(specifiers) {
  return `${specifiers.map((s) => `import ${JSON.stringify(s)};`).join("\n")}\n`;
}

function applyDrizzleOverlay(text) {
  if (!existsSync(GENERATED_SURFACE_ABS)) {
    throw new Error(
      `types VFS: generated drizzle surface missing at ${GENERATED_SURFACE_ABS} — run gen-drizzle-surface.mjs first`
    );
  }
  let n = 0;
  for (const key of Object.keys(vfs)) {
    if (isDrizzleDeclVfsPath(key)) {
      putText(key, text);
      n += 1;
    }
  }
  if (n === 0) {
    throw new Error(
      "types VFS: drizzle overlay found no drizzle-orm declaration files to replace"
    );
  }
  return n;
}

/**
 * Map an absolute node_modules file to a VFS path `/node_modules/...`.
 * pnpm realpaths land under universe/node_modules/.pnpm/.../node_modules/pkg.
 * @param {string} abs
 */
function toNodeModulesVfsPath(abs) {
  const norm = abs.replaceAll("\\", "/");
  const idx = norm.lastIndexOf("/node_modules/");
  if (idx < 0) {
    return null;
  }
  return norm.slice(idx);
}

/** Absolute path under universe for a `/node_modules/...` VFS key. */
function universeAbsFromVfs(vfsPath) {
  const rel = vfsPath.replace(/^\/node_modules\//, "");
  return join(universeNodeModules, ...rel.split("/"));
}

/**
 * Ensure package.json is present for every package that contributed files.
 * @param {Set<string>} pkgs
 */
function ensurePackageJsons(pkgs) {
  for (const pkg of [...pkgs].sort()) {
    const vfsKey = `/node_modules/${pkg}/package.json`;
    if (vfs[vfsKey]) {
      continue;
    }
    const abs = join(universeNodeModules, ...pkg.split("/"), "package.json");
    if (existsSync(abs)) {
      putFile(vfsKey, abs);
    }
  }
}

/**
 * Host PACKAGE_ENTRY often wants `.d.ts` while the program kept `.d.mts`.
 * For every baked decl file, also pull the sibling dual if present.
 */
function ensureDualDeclSiblings() {
  const keys = Object.keys(vfs).sort();
  for (const vfsPath of keys) {
    if (!vfsPath.startsWith("/node_modules/")) {
      continue;
    }
    /** @type {string | null} */
    let sibling = null;
    if (vfsPath.endsWith(".d.mts")) {
      sibling = vfsPath.replace(/\.d\.mts$/, ".d.ts");
    } else if (vfsPath.endsWith(".d.ts")) {
      sibling = vfsPath.replace(/\.d\.ts$/, ".d.mts");
    } else if (vfsPath.endsWith(".d.cts")) {
      sibling = vfsPath.replace(/\.d\.cts$/, ".d.ts");
    }
    if (!sibling || vfs[sibling]) {
      continue;
    }
    const abs = universeAbsFromVfs(sibling);
    if (existsSync(abs)) {
      putFile(sibling, abs);
      const m = sibling.match(/^\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
      if (m) {
        packageTypeCounts[m[1]] = (packageTypeCounts[m[1]] ?? 0) + 1;
      }
    }
  }
}

/**
 * Also ensure package.json `types`/`typings` entry exists when declared.
 * @param {Set<string>} pkgs
 */
function ensureRootTypesField(pkgs) {
  for (const pkg of [...pkgs].sort()) {
    const pkgJsonText = vfs[`/node_modules/${pkg}/package.json`];
    if (!pkgJsonText) {
      continue;
    }
    let typesRel;
    try {
      const pj = JSON.parse(pkgJsonText);
      typesRel = pj.types ?? pj.typings;
    } catch {
      continue;
    }
    if (typeof typesRel !== "string") {
      continue;
    }
    const cleaned = typesRel.replace(/^\.\//, "");
    const vfsPath = `/node_modules/${pkg}/${cleaned}`.replaceAll("\\", "/");
    if (vfs[vfsPath]) {
      continue;
    }
    const abs = join(universeNodeModules, ...pkg.split("/"), cleaned);
    if (existsSync(abs)) {
      putFile(vfsPath, abs);
      packageTypeCounts[pkg] = (packageTypeCounts[pkg] ?? 0) + 1;
    }
  }
}

function isUnderUniverse(abs) {
  const norm = abs.replaceAll("\\", "/");
  const uni = universeRoot.replaceAll("\\", "/");
  return norm === uni || norm.startsWith(`${uni}/`);
}

function buildClosureFromServedSurface() {
  const specifiers = listServedSpecifiers();
  const synthText = syntheticSource(specifiers);
  const synthNorm = SYNTHETIC_ROOT.replaceAll("\\", "/");
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    esModuleInterop: true,
    isolatedModules: true,
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    types: [],
    typeRoots: [],
  };
  const baseHost = ts.createCompilerHost(options);
  let trimmedFiles = 0;

  /**
   * Single read path for the closure build, so the trimmed text is what the
   * program resolves imports from *and* what lands in the VFS. Patching only
   * one of those would either bake a file the program never saw or resolve a
   * dialect the VFS no longer ships.
   */
  function readTrimmed(fileName) {
    const norm = fileName.replaceAll("\\", "/");
    if (norm === synthNorm) {
      return synthText;
    }
    const text = baseHost.readFile(fileName);
    if (text === undefined || !isTrimTarget(fileName)) {
      return text;
    }
    trimmedFiles++;
    return trimDrizzleDialects(text);
  }

  const host = {
    ...baseHost,
    fileExists(fileName) {
      if (fileName.replaceAll("\\", "/") === synthNorm) {
        return true;
      }
      return baseHost.fileExists(fileName);
    },
    readFile: readTrimmed,
    getSourceFile(fileName, languageVersionOrOptions) {
      const text = readTrimmed(fileName);
      if (text === undefined) {
        return;
      }
      return ts.createSourceFile(
        fileName,
        text,
        languageVersionOrOptions,
        false
      );
    },
    getCurrentDirectory: () => universeRoot,
    resolveModuleNameLiterals(
      moduleLiterals,
      containingFile,
      redirectedReference,
      compilerOptions
    ) {
      return moduleLiterals.map((literal) => {
        const name = literal.text;
        const isRelative =
          name.startsWith("./") ||
          name.startsWith("../") ||
          name.startsWith("/");
        let resolveFrom = containingFile;
        if (!(isRelative || isUnderUniverse(containingFile))) {
          resolveFrom = universeResolveContainingFile;
        }
        const { resolvedModule } = ts.resolveModuleName(
          name,
          resolveFrom,
          compilerOptions,
          host,
          undefined,
          redirectedReference
        );
        return {
          resolvedModule,
          failedLookupLocations: [],
          affectingLocations: [],
          resolutionDiagnostics: [],
        };
      });
    },
  };

  const program = ts.createProgram({
    rootNames: [SYNTHETIC_ROOT],
    options,
    host,
  });

  /** @type {Set<string>} */
  const pkgs = new Set();
  let nmFiles = 0;
  /** @type {string[]} */
  const leaked = [];

  for (const sf of program.getSourceFiles()) {
    const abs = sf.fileName.replaceAll("\\", "/");
    if (abs.includes("typescript/lib")) {
      continue;
    }
    if (!abs.includes("/node_modules/")) {
      continue;
    }
    if (!isUnderUniverse(abs)) {
      leaked.push(abs);
      continue;
    }
    const vfsPath = toNodeModulesVfsPath(abs);
    if (!vfsPath) {
      leaked.push(abs);
      continue;
    }
    if (
      !(
        /\.d\.[cm]?ts$/i.test(vfsPath) ||
        vfsPath.endsWith("package.json") ||
        vfsPath.endsWith(".json") ||
        /\.(mts|cts|ts)$/i.test(vfsPath)
      )
    ) {
      continue;
    }
    putText(vfsPath, sf.text);
    nmFiles++;
    const m = vfsPath.match(/^\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (m) {
      pkgs.add(m[1]);
      packageTypeCounts[m[1]] = (packageTypeCounts[m[1]] ?? 0) + 1;
    }
  }

  if (leaked.length) {
    throw new Error(
      `types VFS resolved ${leaked.length} node_modules file(s) outside the isolated universe (first: ${leaked[0]})`
    );
  }

  if (pkgs.has("@cloudflare/workers-types")) {
    throw new Error(
      "types VFS picked up @cloudflare/workers-types — universe isolation failed (must stay out; see README)"
    );
  }

  ensurePackageJsons(pkgs);
  ensureRootTypesField(pkgs);
  ensureDualDeclSiblings();

  if (trimmedFiles === 0) {
    throw new Error(
      "types VFS: the drizzle dialect trim never ran — column-builder.d.ts was " +
        "not read during the closure build. Either drizzle moved it or the " +
        "host read path changed; see scripts/trim-drizzle-dialects.mjs."
    );
  }

  return {
    syntheticRootCount: specifiers.length,
    servedSpecifiers: specifiers,
    nodeModulesFiles: nmFiles,
    packages: [...pkgs].sort(),
    trimmedFiles,
  };
}

/**
 * Nothing baked may reach a non-SQLite drizzle dialect.
 *
 * The trim is a read filter on one file, but the VFS is also topped up from
 * disk afterwards (`ensureDualDeclSiblings`, `ensureRootTypesField`, the
 * full-package base-ui exception). Any of those could reintroduce an untrimmed
 * sibling — `column-builder.d.cts` is right there next to the file we rewrite.
 * Assert on the finished artifact rather than trusting the one code path.
 */
function assertNoDeadDialects() {
  const offenders = [];
  for (const [path, text] of Object.entries(vfs)) {
    if (path.startsWith("/node_modules/drizzle-orm/")) {
      const rest = path.slice("/node_modules/drizzle-orm/".length);
      if (/^(gel|mysql|pg|singlestore)-core\//.test(rest)) {
        offenders.push(path);
        continue;
      }
    }
    if (/from "\.\/(gel|mysql|pg|singlestore)-core\/index\.js"/.test(text)) {
      offenders.push(`${path} (imports a dead dialect)`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `types VFS ships ${offenders.length} non-SQLite drizzle dialect file(s) — ` +
        "sfab-lite apps run on D1 and loading these cost 67 MB of check-worker " +
        `heap. First: ${offenders[0]}`
    );
  }
}

/**
 * Include every .d.ts and package.json under a package in the isolated
 * universe, not only what the template program closure reached.
 * Deliberate per-package exception: the client kernel vendors the full
 * @base-ui/react surface, so the types VFS must advertise the same vocabulary
 * or apps that import e.g. dialog would fail the check worker.
 *
 * Only `.d.ts` (not sibling `.d.mts`) — base-ui ships both for every file;
 * pulling both would roughly double the package for no resolution gain when
 * the `.d.ts` side is present.
 *
 * Consequence worth knowing before reading `packageTypeCounts` as evidence:
 * an excepted package's count still moves when the template imports more of
 * it, because `ensureDualDeclSiblings` adds `.d.mts` siblings from the program
 * closure that this walk deliberately skipped. A rising count therefore does
 * not mean the exception is leaking; every `.d.ts` is already here.
 */
/** @param {string} vfsPath */
function recordPackageTypeFromVfsPath(vfsPath) {
  const m = vfsPath.match(/^\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (m) {
    packageTypeCounts[m[1]] = (packageTypeCounts[m[1]] ?? 0) + 1;
  }
}

/** @param {string} vfsPath */
function isFullPackageTypesFile(vfsPath) {
  return vfsPath.endsWith(".d.ts") || vfsPath.endsWith("package.json");
}

/**
 * Add one universe file to the VFS when it is a new .d.ts or package.json.
 * @param {string} abs
 * @returns {boolean} true when a file was added
 */
function tryAddFullPackageTypesFile(abs) {
  const vfsPath = toNodeModulesVfsPath(abs);
  if (!(vfsPath && isFullPackageTypesFile(vfsPath)) || vfs[vfsPath]) {
    return false;
  }
  putFile(vfsPath, abs);
  recordPackageTypeFromVfsPath(vfsPath);
  return true;
}

/**
 * @param {string} pkgName
 */
function includeFullPackageTypes(pkgName) {
  const pkgRoot = join(universeNodeModules, ...pkgName.split("/"));
  if (!existsSync(pkgRoot)) {
    throw new Error(`includeFullPackageTypes: missing ${pkgRoot}`);
  }
  let added = 0;
  /** @param {string} dir */
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules") {
        continue;
      }
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (tryAddFullPackageTypesFile(abs)) {
        added++;
      }
    }
  }
  walk(pkgRoot);
  ensurePackageJsons(new Set([pkgName]));
  ensureRootTypesField(new Set([pkgName]));
  return added;
}

const closure = buildClosureFromServedSurface();
const baseUiExtraFiles = includeFullPackageTypes("@base-ui/react");
// Same reason as base-ui: the client kernel vendors every icon, so an app may
// import any of them. Pruning to what the template happens to draw would make
// the check worker reject the other three hundred.
const iconExtraFiles = includeFullPackageTypes("@radix-ui/react-icons");

const drizzleSurface = readFileSync(GENERATED_SURFACE_ABS, "utf8");
const drizzleOverlayFiles = applyDrizzleOverlay(drizzleSurface);

assertNoDeadDialects();

if (!existsSync(coreAmbient)) {
  throw new Error(`cloudflare ambient missing: ${coreAmbient}`);
}
putFile("/types/cloudflare-ambient.d.ts", coreAmbient);

const sortedVfs = Object.fromEntries(
  Object.keys(vfs)
    .sort()
    .map((k) => [k, vfs[k]])
);
const entries = Object.entries(sortedVfs);
let raw = 0;
for (const [, text] of entries) {
  raw += Buffer.byteLength(text);
}
const gzip = gzipSync(Buffer.from(stableStringify(sortedVfs))).length;

const sortedPackageCounts = Object.fromEntries(
  Object.keys(packageTypeCounts)
    .sort()
    .map((k) => [k, packageTypeCounts[k]])
);

const manifest = {
  typescript: PINS.typescript,
  libEntry: "lib.es2022.d.ts",
  libFileCount: libFiles.length,
  packageTypeCounts: sortedPackageCounts,
  vfsFileCount: entries.length,
  vfsRawBytes: raw,
  vfsJsonGzipBytes: gzip,
  prune: {
    mode: "served-specifier-program-closure",
    syntheticRootCount: closure.syntheticRootCount,
    servedSpecifiers: closure.servedSpecifiers,
    nodeModulesFiles: closure.nodeModulesFiles,
    packages: closure.packages,
    note: "Only .d.ts (and package.json) reachable from synthetic roots that import every CLIENT_IMPORT_MAP ∪ SERVER_IMPORT_MAP specifier, resolved against framework/runtime/universe.",
    overlay: {
      "drizzle-orm": {
        mode: "generated-cheap-surface",
        artifact: "src/generated/types-pack/drizzle-orm.d.ts",
        filesRewritten: drizzleOverlayFiles,
        servedSpecifiers: [
          "drizzle-orm",
          "drizzle-orm/sql",
          "drizzle-orm/sqlite-core",
          "drizzle-orm/d1",
        ],
        note: "Live TYPES_VFS serves the generated cheap sqlite/D1 surface at drizzle-orm declaration files. Hono and better-auth still ride the real .d.ts.",
      },
    },
    trim: {
      "drizzle-orm/column-builder.d.ts": {
        filesRewritten: closure.trimmedFiles,
        note: "Dialect-dispatching aliases collapsed to their sqlite branch so the pg/mysql/gel/singlestore modules leave the program. sfab-lite runs on D1. See scripts/trim-drizzle-dialects.mjs. The finished VFS then replaces drizzle declaration files with the generated surface; the trim still runs during closure so a shape-change still fails the build.",
      },
    },
    fullPackageExceptions: {
      "@base-ui/react": {
        extraFiles: baseUiExtraFiles,
        note: "Whole package included so types match the fully-vendored client kernel surface.",
      },
      "@radix-ui/react-icons": {
        extraFiles: iconExtraFiles,
        note: "Same: every icon is vendored into the client kernel, so every icon must typecheck.",
      },
    },
  },
  note: "Pruned types VFS — served-specifier program closure (isolated universe), plus full @base-ui/react and @radix-ui/react-icons. drizzle-orm declaration files are the generated cheap surface.",
};

writeFileSync(
  join(root, "results", "types-vfs-sizes.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

const out = join(generatedDir, "types-vfs.js");
writeFileSync(
  out,
  "/** AUTO-GENERATED by framework/runtime/scripts/prebuild-types-vfs.mjs — do not edit */\n" +
    `export const TYPES_VFS = ${stableStringify(sortedVfs)};\n` +
    `export const TYPES_VFS_MANIFEST = ${stableStringify(manifest)};\n`
);

console.log(manifest);
console.log("wrote", out);
