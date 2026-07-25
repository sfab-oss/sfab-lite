#!/usr/bin/env node
/**
 * Export-agreement gate: everything the types VFS advertises for a kernel
 * runtime specifier must actually be exported by the matching vendor chunk.
 *
 * One direction only — runtime offering extra names is fine. Catches the
 * class of bug where app code typechecks clean and throws at runtime
 * (hono/validator historically; @base-ui/react/* when the client bailout
 * left types without an import-map entry).
 *
 * Reads committed generated artifacts (no rebuild). Prebuild records
 * esbuild metafile export names into runtime-exports.js.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(repoRoot, "package.json"));
const ts = require("typescript");

const kernelGen = join(repoRoot, "packages/kernel/src/generated");

const { TYPES_VFS } = await import(
  pathToFileURL(join(kernelGen, "types-vfs.js")).href
);
const { CLIENT_IMPORT_MAP } = await import(
  pathToFileURL(join(kernelGen, "client-kernel.js")).href
);
const {
  CLIENT_RUNTIME_EXPORTS,
  SERVER_RUNTIME_EXPORTS,
  SERVER_IMPORT_MAP,
} = await import(pathToFileURL(join(kernelGen, "runtime-exports.js")).href);

/**
 * Resolve the .d.ts path in TYPES_VFS for a bare package specifier.
 * Prefers package.json "exports" types conditions, then common fallbacks.
 * @param {string} specifier
 * @returns {string | null} VFS path
 */
function resolveTypesEntry(specifier) {
  const at = specifier.startsWith("@")
    ? specifier.indexOf("/", specifier.indexOf("/") + 1)
    : specifier.indexOf("/");
  const pkg = at === -1 ? specifier : specifier.slice(0, at);
  const sub =
    at === -1 ? "." : `./${specifier.slice(pkg.length + 1)}`;

  const pkgJsonText = TYPES_VFS[`/node_modules/${pkg}/package.json`];
  if (pkgJsonText) {
    try {
      const pj = JSON.parse(pkgJsonText);
      const fromExports = typesPathFromExports(pj.exports, sub);
      if (fromExports) {
        const abs = normalizePkgRel(pkg, fromExports);
        if (TYPES_VFS[abs]) {
          return abs;
        }
        for (const alt of dualDeclAlternates(abs)) {
          if (TYPES_VFS[alt]) {
            return alt;
          }
        }
      }
      if (sub === "." && (pj.types || pj.typings)) {
        const abs = normalizePkgRel(pkg, pj.types || pj.typings);
        if (TYPES_VFS[abs]) {
          return abs;
        }
      }
    } catch {
      // fall through to heuristics
    }
  }

  const rest = sub === "." ? "" : sub.slice(2);
  for (const cand of candidatesFor(pkg, rest)) {
    if (TYPES_VFS[cand]) {
      return cand;
    }
  }
  return null;
}

/**
 * @param {unknown} exportsField
 * @param {string} subpath  "." or "./foo"
 * @returns {string | null} relative types path from package root
 */
function typesPathFromExports(exportsField, subpath) {
  if (!exportsField || typeof exportsField !== "object") {
    return null;
  }
  const entry = /** @type {Record<string, unknown>} */ (exportsField)[subpath];
  if (entry == null) {
    return null;
  }
  if (typeof entry === "string") {
    return entry.endsWith(".d.ts") || entry.endsWith(".d.mts") ? entry : null;
  }
  if (typeof entry !== "object") {
    return null;
  }
  const obj = /** @type {Record<string, unknown>} */ (entry);
  for (const cond of ["types", "import", "module", "default", "require"]) {
    const v = obj[cond];
    if (typeof v === "string") {
      if (cond === "types" || /\.d\.[cm]?ts$/.test(v)) {
        return v;
      }
      // Map .js/.mjs runtime path to a sibling declaration if present later.
      const asDts = v.replace(/\.mjs$/, ".d.mts").replace(/\.js$/, ".d.ts");
      return asDts;
    }
    if (v && typeof v === "object") {
      const nested = /** @type {Record<string, unknown>} */ (v);
      if (typeof nested.types === "string") {
        return nested.types;
      }
      if (typeof nested.default === "string") {
        const d = nested.default;
        return d.replace(/\.mjs$/, ".d.mts").replace(/\.js$/, ".d.ts");
      }
    }
  }
  return null;
}

/** @param {string} pkg @param {string} rel */
function normalizePkgRel(pkg, rel) {
  const cleaned = rel.replace(/^\.\//, "");
  return `/node_modules/${pkg}/${cleaned}`.replaceAll("\\", "/");
}

/** @param {string} vfsPath */
function dualDeclAlternates(vfsPath) {
  if (vfsPath.endsWith(".d.ts")) {
    return [vfsPath.replace(/\.d\.ts$/, ".d.mts")];
  }
  if (vfsPath.endsWith(".d.mts")) {
    return [vfsPath.replace(/\.d\.mts$/, ".d.ts")];
  }
  return [];
}

/** @param {string} pkg @param {string} rest */
function candidatesFor(pkg, rest) {
  const base = `/node_modules/${pkg}`;
  if (!rest) {
    return [
      `${base}/index.d.ts`,
      `${base}/index.d.mts`,
      `${base}/dist/types/index.d.ts`,
      `${base}/dist/index.d.ts`,
      `${base}/dist/index.d.mts`,
      `${base}/dist/esm/index.d.ts`,
      `${base}/build/modern/index.d.ts`,
    ];
  }
  return [
    `${base}/${rest}.d.ts`,
    `${base}/${rest}.d.mts`,
    `${base}/${rest}/index.d.ts`,
    `${base}/${rest}/index.d.mts`,
    `${base}/dist/types/${rest}.d.ts`,
    `${base}/dist/types/${rest}/index.d.ts`,
    `${base}/dist/${rest}.d.ts`,
    `${base}/dist/${rest}/index.d.ts`,
    `${base}/dist/${rest}/index.d.mts`,
  ];
}

/**
 * Value export names advertised by a .d.ts in TYPES_VFS (type-only skipped).
 * @param {string} entryPath
 * @returns {string[]}
 */
function valueExportsFromDts(entryPath) {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
  };

  /** @type {Map<string, ts.SourceFile>} */
  const sfCache = new Map();

  const host = {
    ...ts.createCompilerHost(options),
    fileExists: (f) => {
      const n = f.replaceAll("\\", "/");
      return TYPES_VFS[n] != null || ts.sys.fileExists(f);
    },
    readFile: (f) => {
      const n = f.replaceAll("\\", "/");
      return TYPES_VFS[n] ?? ts.sys.readFile(f);
    },
    getSourceFile: (fileName, languageVersion, onError) => {
      const n = fileName.replaceAll("\\", "/");
      if (sfCache.has(n)) {
        return sfCache.get(n);
      }
      const text = TYPES_VFS[n];
      if (text != null) {
        const sf = ts.createSourceFile(n, text, languageVersion, true);
        sfCache.set(n, sf);
        return sf;
      }
      return ts.createCompilerHost(options).getSourceFile(
        fileName,
        languageVersion,
        onError
      );
    },
    resolveModuleNameLiterals(
      moduleLiterals,
      containingFile,
      redirectedReference,
      compilerOptions
    ) {
      return moduleLiterals.map((literal) => {
        const name = literal.text;
        if (!(name.startsWith(".") || name.startsWith("/"))) {
          const resolved = resolveTypesEntry(name);
          if (resolved) {
            return {
              resolvedModule: {
                resolvedFileName: resolved,
                extension: resolved.endsWith(".tsx")
                  ? ts.Extension.Tsx
                  : ts.Extension.Dts,
                isExternalLibraryImport: true,
              },
              failedLookupLocations: [],
              affectingLocations: [],
              resolutionDiagnostics: [],
            };
          }
        }
        const { resolvedModule } = ts.resolveModuleName(
          name,
          containingFile,
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
    rootNames: [entryPath],
    options,
    host,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entryPath);
  if (!sf) {
    return [];
  }
  const mod = checker.getSymbolAtLocation(sf);
  if (!mod) {
    // Source file symbol can be missing; use module symbol from file.
    const sym = /** @type {ts.SourceFile & { symbol?: ts.Symbol }} */ (sf)
      .symbol;
    if (!sym) {
      return [];
    }
    return exportNamesFromModuleSymbol(checker, sym);
  }
  return exportNamesFromModuleSymbol(checker, mod);
}

/**
 * @param {ts.TypeChecker} checker
 * @param {ts.Symbol} mod
 */
function exportNamesFromModuleSymbol(checker, mod) {
  /** @type {string[]} */
  const names = [];
  for (const sym of checker.getExportsOfModule(mod)) {
    // Skip type-only exports — they are not runtime values.
    if (!(sym.flags & ts.SymbolFlags.Value)) {
      continue;
    }
    if (sym.name === "__export" || sym.name.startsWith("__")) {
      continue;
    }
    names.push(sym.getName());
  }
  return [...new Set(names)].sort();
}

/**
 * Package roots that the kernel intends to expose at runtime (pins + client
 * extras). Tooling pins (typescript, esbuild, tailwindcss) are excluded.
 */
const KERNEL_SURFACE_PACKAGES = new Set([
  "react",
  "react-dom",
  "better-auth",
  "drizzle-orm",
  "hono",
  "@tanstack/react-router",
  "@tanstack/react-query",
  "@base-ui/react",
  "zod",
  "clsx",
  "class-variance-authority",
  "tailwind-merge",
]);

/**
 * Public export subpaths of a package that have a .d.ts present in TYPES_VFS.
 * @param {string} pkg
 * @returns {string[]} bare specifiers
 */
function advertisedSpecifiersForPackage(pkg) {
  const pkgJsonText = TYPES_VFS[`/node_modules/${pkg}/package.json`];
  if (!pkgJsonText) {
    return [];
  }
  let exportsField;
  try {
    exportsField = JSON.parse(pkgJsonText).exports;
  } catch {
    return [];
  }
  /** @type {string[]} */
  const specs = [];
  if (!exportsField || typeof exportsField !== "object") {
    const entry = resolveTypesEntry(pkg);
    return entry ? [pkg] : [];
  }
  for (const sub of Object.keys(exportsField)) {
    if (
      sub === "./package.json" ||
      sub === "./types" ||
      sub.startsWith("./internals")
    ) {
      continue;
    }
    const spec = sub === "." ? pkg : `${pkg}/${sub.slice(2)}`;
    if (resolveTypesEntry(spec)) {
      specs.push(spec);
    }
  }
  return specs.sort();
}

/** @type {string[]} */
const failures = [];

/**
 * @param {string} half
 * @param {string} spec
 * @param {string[]} typeNames
 * @param {string[] | undefined} runtimeNames
 */
function compare(half, spec, typeNames, runtimeNames) {
  if (!runtimeNames) {
    failures.push(
      `[${half}] ${spec}: types advertise value exports [${typeNames.join(", ")}] but runtime has no module`
    );
    return;
  }
  const runtimeSet = new Set(runtimeNames);
  const missing = typeNames.filter((n) => !runtimeSet.has(n));
  if (missing.length) {
    failures.push(
      `[${half}] ${spec}: types advertise [${missing.join(", ")}] missing from runtime (have ${runtimeNames.length} exports)`
    );
  }
}

// --- Client + server import-map keys ---
for (const [spec, _rel] of Object.entries(CLIENT_IMPORT_MAP)) {
  const dts = resolveTypesEntry(spec);
  if (!dts) {
    // No types in VFS for this runtime key — harmless (runtime ⊇ types).
    continue;
  }
  const typeNames = valueExportsFromDts(dts);
  if (typeNames.length === 0) {
    continue;
  }
  compare("client", spec, typeNames, CLIENT_RUNTIME_EXPORTS[spec]);
}

for (const [spec, _rel] of Object.entries(SERVER_IMPORT_MAP)) {
  const dts = resolveTypesEntry(spec);
  if (!dts) {
    continue;
  }
  const typeNames = valueExportsFromDts(dts);
  if (typeNames.length === 0) {
    continue;
  }
  compare("server", spec, typeNames, SERVER_RUNTIME_EXPORTS[spec]);
}

// --- Orphan packages: types in VFS, zero runtime coverage ---
// Catches @base-ui/react when it was bailed out of the client kernel while
// the VFS still shipped its .d.ts (the blank-page failure mode).
for (const pkg of [...KERNEL_SURFACE_PACKAGES].sort()) {
  const advertised = advertisedSpecifiersForPackage(pkg);
  if (advertised.length === 0) {
    continue;
  }
  const covered = advertised.filter(
    (s) => s in CLIENT_IMPORT_MAP || s in SERVER_IMPORT_MAP
  );
  if (covered.length === 0) {
    failures.push(
      `[orphan] ${pkg}: types advertise ${advertised.length} specifier(s) (e.g. ${advertised.slice(0, 3).join(", ")}) but neither client nor server import map covers the package`
    );
  }
}

if (failures.length) {
  console.error("check:export-agreement — FAILED\n");
  for (const f of failures) {
    console.error(`  ${f}`);
  }
  console.error(
    `\n${failures.length} disagreement(s). Types promised exports the runtime does not provide.`
  );
  process.exit(1);
}

console.log(
  `check:export-agreement — ok (${Object.keys(CLIENT_IMPORT_MAP).length} client + ${Object.keys(SERVER_IMPORT_MAP).length} server specifiers)`
);
