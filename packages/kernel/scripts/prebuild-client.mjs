/**
 * Browser client kernel chunks for import-map sharing.
 * Emits vendor/client/*.js + src/generated/client-kernel.js.
 * Size summary folds into kernel.json via prebuild.mjs.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  getUniverseRequire,
  universeNodeModules,
  universeResolvePlugin,
} from "./universe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "vendor", "client");
const shimDir = join(root, "scripts", ".shims-client");
const generatedDir = join(root, "src", "generated");
const require = getUniverseRequire();
const esbuild = require("esbuild");

mkdirSync(outDir, { recursive: true });
mkdirSync(shimDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });
mkdirSync(join(root, "results"), { recursive: true });

const reactPkg = dirname(require.resolve("react/package.json"));
const reactDomPkg = dirname(require.resolve("react-dom/package.json"));

/** @param {string} absEntry @param {string[]} named @param {string} shimPath */
function writeDefaultReexportShim(absEntry, named, shimPath) {
  writeFileSync(
    shimPath,
    [
      `import __mod from ${JSON.stringify(absEntry)};`,
      "export default __mod;",
      "export const {",
      named.map((n) => `  ${n}`).join(",\n"),
      "} = __mod;",
      "",
    ].join("\n")
  );
}

const REACT_NAMED = [
  "Children",
  "Component",
  "Fragment",
  "Profiler",
  "PureComponent",
  "StrictMode",
  "Suspense",
  "cloneElement",
  "createContext",
  "createElement",
  "createRef",
  "forwardRef",
  "isValidElement",
  "lazy",
  "memo",
  "startTransition",
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
  "version",
];
const JSX_NAMED = ["jsx", "jsxs", "Fragment"];
const REACT_DOM_NAMED = ["createPortal", "flushSync", "version"];

writeDefaultReexportShim(
  join(reactPkg, "index.js"),
  REACT_NAMED,
  join(shimDir, "react.mjs")
);
writeDefaultReexportShim(
  join(reactPkg, "jsx-runtime.js"),
  JSX_NAMED,
  join(shimDir, "jsx-runtime.mjs")
);
writeDefaultReexportShim(
  join(reactDomPkg, "index.js"),
  REACT_DOM_NAMED,
  join(shimDir, "react-dom.mjs")
);
writeFileSync(
  join(shimDir, "react-dom-client.mjs"),
  `${`
import * as m from ${JSON.stringify(join(reactDomPkg, "client.js"))};
export const { createRoot, hydrateRoot } = m;
export default m;
`.trim()}\n`
);

/** @type {Array<{ name: string; entry: string; outfile: string; external?: string[] }>} */
const chunks = [
  {
    name: "react",
    entry: join(shimDir, "react.mjs"),
    outfile: join(outDir, "react.js"),
  },
  {
    name: "react/jsx-runtime",
    entry: join(shimDir, "jsx-runtime.mjs"),
    outfile: join(outDir, "jsx-runtime.js"),
    external: ["react"],
  },
  {
    name: "react-dom",
    entry: join(shimDir, "react-dom.mjs"),
    outfile: join(outDir, "react-dom.js"),
    external: ["react"],
  },
  {
    name: "react-dom/client",
    entry: join(shimDir, "react-dom-client.mjs"),
    outfile: join(outDir, "react-dom-client.js"),
    external: ["react", "react-dom"],
  },
];

/** Map a react/react-dom bare specifier to a relative flat client chunk path. */
function toClientFlatKey(spec) {
  if (spec === "react") {
    return "./react.js";
  }
  if (spec === "react/jsx-runtime") {
    return "./jsx-runtime.js";
  }
  if (spec === "react-dom/client") {
    return "./react-dom-client.js";
  }
  if (spec === "react-dom" || spec.startsWith("react-dom/")) {
    return "./react-dom.js";
  }
  return spec;
}

/** Flat filename without ./ — what the external plugin stamps onto __require(). */
function toClientFlatBare(spec) {
  const rel = toClientFlatKey(spec);
  return rel.startsWith("./") ? rel.slice(2) : rel;
}

/**
 * Rewrite esbuild's CJS `__require` stub so in-browser evaluation of
 * use-sync-external-store (and similar) can load react from the flat chunk.
 * Matches the original package name plus the flat bare/relative forms the
 * external plugin may have rewritten require() arguments to.
 */
function rewriteExternalRequires(source, external) {
  if (!external.length) {
    return source;
  }
  const imports = [];
  const map = [];
  for (const spec of external) {
    const id = spec.replace(/[^a-zA-Z0-9]/g, "_");
    const flatRel = toClientFlatKey(spec);
    const flatBare = toClientFlatBare(spec);
    imports.push(`import __ext_${id} from ${JSON.stringify(flatRel)};`);
    map.push(
      `  if (x === ${JSON.stringify(spec)} || x === ${JSON.stringify(flatBare)} || x === ${JSON.stringify(flatRel)}) return __ext_${id}?.default ?? __ext_${id};`
    );
  }
  const stubRe =
    /var __require = \/\* @__PURE__ \*\/[\s\S]*?throw Error\('Dynamic require of "' \+ x \+ '" is not supported'\);\n\}\);/;
  if (!stubRe.test(source)) {
    return source;
  }
  return `${imports.join("\n")}\n${source.replace(
    stubRe,
    `function __require(x) {
${map.join("\n")}
  throw Error('Dynamic require of "' + x + '" is not supported');
}`
  )}`;
}

const browserShared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["import", "module", "browser", "default"],
  mainFields: ["browser", "module", "main"],
  logLevel: "info",
  plugins: [universeResolvePlugin()],
};

/** @type {Record<string, number>} */
const sizesRaw = {};
/** @type {string[]} */
const clientChunkFiles = [];
/** @type {Record<string, string>} */
const importMap = {};
/** @type {Record<string, string>} */
const hashes = {};
/** @type {string[]} */
const bailouts = [];
/** @type {Record<string, string[]>} flat chunk filename → esbuild metafile export names */
const chunkExportNames = {};

/**
 * Read named exports for an outfile from an esbuild metafile.
 * @param {import("esbuild").Metafile} metafile
 * @param {string} outfileAbs
 */
function exportsFromMetafile(metafile, outfileAbs) {
  const norm = outfileAbs.replaceAll("\\", "/");
  for (const [outPath, meta] of Object.entries(metafile.outputs)) {
    if (outPath.replaceAll("\\", "/") === norm || outPath.endsWith(`/${norm.split("/").pop()}`)) {
      return [...(meta.exports ?? [])].sort();
    }
  }
  return [];
}

for (const chunk of chunks) {
  const result = await esbuild.build({
    ...browserShared,
    entryPoints: [chunk.entry],
    outfile: chunk.outfile,
    external: chunk.external ?? [],
    metafile: true,
  });
  let source = readFileSync(chunk.outfile, "utf8");
  source = rewriteExternalRequires(source, chunk.external ?? []);
  writeFileSync(chunk.outfile, source);
  const bytes = Buffer.byteLength(source);
  sizesRaw[chunk.name] = bytes;
  const file = chunk.outfile.split("/").pop();
  clientChunkFiles.push(file);
  importMap[chunk.name] = `./${file}`;
  hashes[file] = `sha256:${createHash("sha256").update(source).digest("hex")}`;
  chunkExportNames[file] = exportsFromMetafile(result.metafile, chunk.outfile);
  console.log(`client wrote ${file} (${bytes} bytes)`);
}

/** Helper: vendor a package entry to a flat client chunk. */
async function vendorPkg(opts) {
  const { name, entrySource, outfileName, external = [], importKeys } = opts;
  const entry = join(shimDir, `${outfileName.replace(/\.js$/, "")}.entry.mjs`);
  writeFileSync(entry, entrySource);
  const outfile = join(outDir, outfileName);
  try {
    const result = await esbuild.build({
      ...browserShared,
      entryPoints: [entry],
      outfile,
      external,
      metafile: true,
      plugins: [
        ...(external.length
          ? [
              {
                name: "flat-client-externals",
                setup(build) {
                  build.onResolve(
                    {
                      filter: /^(react|react-dom|react\/jsx-runtime)(\/.*)?$/,
                    },
                    (args) => ({
                      // Bare flat name (not ./) so CJS __require("react.js")
                      // matches what rewriteExternalRequires maps.
                      path: toClientFlatBare(args.path),
                      external: true,
                    })
                  );
                },
              },
            ]
          : []),
        universeResolvePlugin(),
      ],
    });
    let source = readFileSync(outfile, "utf8");
    // Relative paths so chunks resolve each other when served from
    // /kernel/:ver/client/ without relying on import-map flat aliases.
    source = source
      .replace(/from\s+["']react["']/g, 'from "./react.js"')
      .replace(/from\s+["']react\/jsx-runtime["']/g, 'from "./jsx-runtime.js"')
      .replace(
        /from\s+["']react-dom\/client["']/g,
        'from "./react-dom-client.js"'
      )
      .replace(/from\s+["']react-dom["']/g, 'from "./react-dom.js"')
      // esbuild external plugin may already have emitted bare flat names.
      .replace(/from\s+["']react\.js["']/g, 'from "./react.js"')
      .replace(/from\s+["']jsx-runtime\.js["']/g, 'from "./jsx-runtime.js"')
      .replace(
        /from\s+["']react-dom-client\.js["']/g,
        'from "./react-dom-client.js"'
      )
      .replace(/from\s+["']react-dom\.js["']/g, 'from "./react-dom.js"');
    // CJS shims inside the bundle call __require("react.js") — rewrite the
    // stub so those resolve to the ESM flat chunk (vendorPkg previously skipped this).
    source = rewriteExternalRequires(source, external);
    writeFileSync(outfile, source);
    const bytes = Buffer.byteLength(source);
    sizesRaw[name] = bytes;
    clientChunkFiles.push(outfileName);
    hashes[outfileName] =
      `sha256:${createHash("sha256").update(source).digest("hex")}`;
    chunkExportNames[outfileName] = exportsFromMetafile(result.metafile, outfile);
    for (const key of importKeys) {
      importMap[key] = `./${outfileName}`;
    }
    console.log(`client wrote ${outfileName} (${bytes} bytes)`);
    return true;
  } catch (e) {
    console.warn(
      `client bailout for ${name}:`,
      e instanceof Error ? e.message : e
    );
    bailouts.push(name);
    return false;
  }
}

await vendorPkg({
  name: "@tanstack/react-router",
  entrySource: `export * from "@tanstack/react-router";\n`,
  outfileName: "tanstack-router.js",
  external: ["react", "react-dom", "react/jsx-runtime"],
  importKeys: ["@tanstack/react-router"],
});

await vendorPkg({
  name: "@tanstack/react-query",
  entrySource: `export * from "@tanstack/react-query";\n`,
  outfileName: "tanstack-query.js",
  external: ["react", "react-dom", "react/jsx-runtime"],
  importKeys: ["@tanstack/react-query"],
});

await vendorPkg({
  name: "clsx",
  entrySource: `export * from "clsx";\nexport { default } from "clsx";\n`,
  outfileName: "clsx.js",
  importKeys: ["clsx"],
});

await vendorPkg({
  name: "class-variance-authority",
  entrySource: `export * from "class-variance-authority";\n`,
  outfileName: "cva.js",
  importKeys: ["class-variance-authority"],
});

await vendorPkg({
  name: "tailwind-merge",
  entrySource: `export * from "tailwind-merge";\n`,
  outfileName: "tailwind-merge.js",
  importKeys: ["tailwind-merge"],
});

await vendorPkg({
  name: "hono/client",
  entrySource: `export * from "hono/client";\n`,
  outfileName: "hono-client.js",
  importKeys: ["hono/client", "hono"],
});

const betterAuthOk = await vendorPkg({
  name: "better-auth/react",
  entrySource: `${`
export { createAuthClient } from "better-auth/react";
export { organizationClient } from "better-auth/client/plugins";
`.trim()}\n`,
  outfileName: "better-auth-client.js",
  external: ["react", "react-dom", "react/jsx-runtime"],
  importKeys: ["better-auth/react", "better-auth/client/plugins"],
});
if (!betterAuthOk) {
  bailouts.push("better-auth/react → bundle into app (B)");
}

/**
 * Public import-map keys for @base-ui/react, derived from the installed
 * package.json `exports` so a base-ui upgrade cannot silently drop a subpath.
 * Skips ./package.json, ./types, and ./internals/* (not part of the root surface).
 */
function baseUiImportKeys() {
  // Read from the isolated universe path — avoid require.resolve("…/package.json"),
  // which knip treats as an unlisted dependency edge.
  const pkgJsonPath = join(
    universeNodeModules,
    "@base-ui",
    "react",
    "package.json"
  );
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const exportsField = pkg.exports;
  if (!exportsField || typeof exportsField !== "object") {
    throw new Error("@base-ui/react package.json has no exports map");
  }
  /** @type {string[]} */
  const keys = [];
  for (const subpath of Object.keys(exportsField).sort()) {
    if (
      subpath === "./package.json" ||
      subpath === "./types" ||
      subpath.startsWith("./internals")
    ) {
      continue;
    }
    if (subpath === ".") {
      keys.push("@base-ui/react");
      continue;
    }
    if (!subpath.startsWith("./")) {
      throw new Error(
        `@base-ui/react exports key is not a relative subpath: ${subpath}`
      );
    }
    keys.push(`@base-ui/react/${subpath.slice(2)}`);
  }
  if (keys.length === 0) {
    throw new Error("@base-ui/react exports map produced zero public keys");
  }
  return keys;
}

const baseUiOk = await vendorPkg({
  name: "@base-ui/react",
  // Root index re-exports every stable public component. unstable-use-media-query
  // is on the package.json exports map but not the root index — pull it in
  // explicitly so the import-map alias for that subpath is not a lie.
  entrySource: `${`
export * from "@base-ui/react";
export { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
`.trim()}\n`,
  outfileName: "base-ui-react.js",
  external: ["react", "react-dom", "react/jsx-runtime"],
  importKeys: baseUiImportKeys(),
});
if (!baseUiOk) {
  bailouts.push("@base-ui/react/* → bundle into app (B)");
}

const filesExport = Object.fromEntries(
  clientChunkFiles.map((f) => [f, readFileSync(join(outDir, f), "utf8")])
);
const genBody = [
  "/** AUTO-GENERATED by packages/kernel/scripts/prebuild-client.mjs — do not edit */",
  "",
  `export const CLIENT_KERNEL_FILES = ${JSON.stringify(filesExport)};`,
  `export const CLIENT_IMPORT_MAP = ${JSON.stringify(importMap)};`,
  `export const CLIENT_BAILOUTS = ${JSON.stringify(bailouts)};`,
  "",
].join("\n");
writeFileSync(join(generatedDir, "client-kernel.js"), genBody);

/** @type {Record<string, number>} */
const sizesGzip = {};
for (const f of clientChunkFiles) {
  sizesGzip[f] = gzipSync(readFileSync(join(outDir, f))).length;
}
const raw = Object.values(sizesRaw).reduce((a, b) => a + b, 0);
const gzip = Object.values(sizesGzip).reduce((a, b) => a + b, 0);

/** @type {Record<string, string[]>} bare specifier → runtime export names */
const runtimeExports = {};
for (const [spec, rel] of Object.entries(importMap)) {
  const file = rel.replace(/^\.\//, "");
  runtimeExports[spec] = chunkExportNames[file] ?? [];
}

const summary = {
  clientChunks: clientChunkFiles,
  importMap,
  hashes,
  sizesRaw,
  sizesGzip,
  totals: { raw, gzip },
  bailouts,
  runtimeExports,
};
writeFileSync(
  join(root, "results", "client-kernel-sizes.json"),
  `${JSON.stringify(summary, null, 2)}\n`
);
console.log("client kernel summary", {
  chunks: clientChunkFiles.length,
  raw,
  gzip,
  bailouts,
});
