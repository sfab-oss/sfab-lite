/**
 * Types VFS for the check worker's TypeScript LanguageService.
 *
 * Prunes to the template app's TypeScript program closure (files the
 * checker actually pulls), not whole-package .d.ts dumps. Keeps DOM/ES
 * libs + Cloudflare ambient from @sfab-lite/core.
 *
 * Module resolution for bare specifiers is forced through the isolated
 * kernel universe (packages/kernel/universe) so workspace peers cannot
 * leak into the VFS.
 *
 * Emits src/generated/types-vfs.js + results/types-vfs-sizes.json.
 * Export shape is a contract for apps/check: TYPES_VFS + TYPES_VFS_MANIFEST.
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
import { PINS } from "./pins.mjs";
import {
  getUniverseRequire,
  universeNodeModules,
  universeResolveContainingFile,
  universeRoot,
} from "./universe.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePkg = join(root, "..", "template");
const templateAppSrc = join(templatePkg, "app", "src");
const coreAmbient = join(root, "..", "core", "src", "cloudflare-ambient.d.ts");
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

/** Collect template app roots (overlay at check time; not baked into VFS). */
function listTemplateRoots() {
  /** @type {string[]} */
  const roots = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else if (/\.(ts|tsx)$/.test(name)) {
        roots.push(abs);
      }
    }
  }
  if (!existsSync(templateAppSrc)) {
    throw new Error(`template app src missing: ${templateAppSrc}`);
  }
  walk(templateAppSrc);
  return roots;
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

function buildClosureFromTemplateProgram() {
  const roots = listTemplateRoots();
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
    // No ambient @types from the workspace — only what the universe installs.
    types: [],
    typeRoots: [],
  };
  const baseHost = ts.createCompilerHost(options);
  const host = {
    ...baseHost,
    getCurrentDirectory: () => templatePkg,
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
        // Template sources live outside the universe — force bare specs to
        // resolve from universe/. Files already under universe/node_modules
        // must keep their real containingFile so pnpm nested deps resolve.
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
    rootNames: roots,
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
  return {
    templateRootCount: roots.length,
    nodeModulesFiles: nmFiles,
    packages: [...pkgs].sort(),
  };
}

const closure = buildClosureFromTemplateProgram();

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
    mode: "template-ts-program-closure",
    templateRootCount: closure.templateRootCount,
    nodeModulesFiles: closure.nodeModulesFiles,
    packages: closure.packages,
    note: "Only .d.ts (and package.json) reachable from packages/template/app/src via TS program resolution against packages/kernel/universe.",
  },
  note: "Pruned types VFS — template app program closure (isolated universe).",
};

writeFileSync(
  join(root, "results", "types-vfs-sizes.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

const out = join(generatedDir, "types-vfs.js");
writeFileSync(
  out,
  "/** AUTO-GENERATED by packages/kernel/scripts/prebuild-types-vfs.mjs — do not edit */\n" +
    `export const TYPES_VFS = ${stableStringify(sortedVfs)};\n` +
    `export const TYPES_VFS_MANIFEST = ${stableStringify(manifest)};\n`
);

console.log(manifest);
console.log("wrote", out);
