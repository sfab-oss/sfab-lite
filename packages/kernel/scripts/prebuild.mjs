/**
 * Server kernel prebuild (Node + esbuild).
 * Builds LOADER vendor chunks, then runs types VFS / client / CSS prebuilds,
 * and writes kernel.json + vendor/manifest.json + src/generated/server-kernel.js.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { KERNEL_VERSION, PINS } from "./pins.mjs";
import { getUniverseRequire, universeResolvePlugin } from "./universe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const vendorDir = join(root, "vendor");
const shimDir = join(root, "scripts", ".shims");
const generatedDir = join(root, "src", "generated");
const require = getUniverseRequire();
const esbuild = require("esbuild");

mkdirSync(vendorDir, { recursive: true });
mkdirSync(shimDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });
mkdirSync(join(root, "results"), { recursive: true });

const reactPkg = dirname(require.resolve("react/package.json"));
const reactDomPkg = dirname(require.resolve("react-dom/package.json"));

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
const REACT_DOM_NAMED = ["createPortal", "flushSync", "version"];
const REACT_DOM_SERVER_NAMED = [
  "renderToString",
  "renderToStaticMarkup",
  "version",
];
const JSX_RUNTIME_NAMED = ["jsx", "jsxs", "Fragment"];

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

writeDefaultReexportShim(
  join(reactPkg, "index.js"),
  REACT_NAMED,
  join(shimDir, "react.mjs")
);
writeDefaultReexportShim(
  join(reactPkg, "jsx-runtime.js"),
  JSX_RUNTIME_NAMED,
  join(shimDir, "jsx-runtime.mjs")
);
writeDefaultReexportShim(
  join(reactDomPkg, "index.js"),
  REACT_DOM_NAMED,
  join(shimDir, "react-dom.mjs")
);
writeDefaultReexportShim(
  join(reactDomPkg, "server.edge.js"),
  REACT_DOM_SERVER_NAMED,
  join(shimDir, "react-dom-server.mjs")
);

const NODE_EXTERNALS = [
  "cloudflare:*",
  "node:*",
  "node:crypto",
  "node:buffer",
  "node:path",
  "node:fs",
  "node:url",
  "node:module",
  "node:util",
  "node:stream",
  "node:async_hooks",
  "node:events",
  "node:process",
];

/** Flat LOADER key for a bare npm specifier. */
function toFlatKey(spec) {
  if (spec === "react") {
    return "react.js";
  }
  if (spec === "react-dom") {
    return "react-dom.js";
  }
  if (spec === "react/jsx-runtime") {
    return "jsx-runtime.js";
  }
  if (spec === "react-dom/server") {
    return "react-dom-server.js";
  }
  if (spec === "drizzle-orm" || spec.startsWith("drizzle-orm/")) {
    return "drizzle-orm.js";
  }
  if (spec === "better-auth" || spec.startsWith("better-auth/")) {
    return "better-auth.js";
  }
  if (spec === "hono" || spec.startsWith("hono/")) {
    return "hono.js";
  }
  if (spec === "zod" || spec.startsWith("zod/")) {
    return "zod.js";
  }
  return spec;
}

/**
 * Rewrite esbuild CJS `__require` stubs into ESM imports of flat keys.
 * @param {string} source
 * @param {string[]} external
 */
function rewriteExternalRequiresToEsm(source, external) {
  if (!external.length) {
    return source;
  }
  const imports = [];
  const map = [];
  for (const spec of external) {
    const id = spec.replace(/[^a-zA-Z0-9]/g, "_");
    const abs = toFlatKey(spec);
    imports.push(`import __ext_${id} from ${JSON.stringify(abs)};`);
    map.push(
      `  if (x === ${JSON.stringify(spec)}) return __ext_${id}?.default ?? __ext_${id};`
    );
  }
  const stubRe =
    /var __require = \/\* @__PURE__ \*\/[\s\S]*?throw Error\('Dynamic require of "' \+ x \+ '" is not supported'\);\n\}\);/;
  if (!stubRe.test(source)) {
    return source;
  }
  const withHelper = source.replace(
    stubRe,
    `function __require(x) {
${map.join("\n")}
  throw Error('Dynamic require of "' + x + '" is not supported');
}`
  );
  return `${imports.join("\n")}\n${withHelper}`;
}

/** @type {Array<{ name: string; exportName: string; entry: string; outfile: string; external?: string[] }>} */
const reactChunks = [
  {
    name: "react",
    exportName: "KERNEL_REACT",
    entry: join(shimDir, "react.mjs"),
    outfile: join(vendorDir, "react.js"),
  },
  {
    name: "react/jsx-runtime",
    exportName: "KERNEL_JSX_RUNTIME",
    entry: join(shimDir, "jsx-runtime.mjs"),
    outfile: join(vendorDir, "jsx-runtime.js"),
    external: ["react"],
  },
  {
    name: "react-dom",
    exportName: "KERNEL_REACT_DOM",
    entry: join(shimDir, "react-dom.mjs"),
    outfile: join(vendorDir, "react-dom.js"),
    external: ["react"],
  },
  {
    name: "react-dom/server",
    exportName: "KERNEL_REACT_DOM_SERVER",
    entry: join(shimDir, "react-dom-server.mjs"),
    outfile: join(vendorDir, "react-dom-server.js"),
    external: ["react", "react-dom"],
  },
];

const sizes = {};
/** @type {string[]} */
const exportsOut = [
  "/** AUTO-GENERATED by packages/kernel/scripts/prebuild.mjs — do not edit */",
  "",
];
/** @type {Record<string, string[]>} flat chunk filename → esbuild metafile export names */
const serverChunkExportNames = {};

/**
 * @param {import("esbuild").Metafile} metafile
 * @param {string} outfileAbs
 */
function exportsFromMetafile(metafile, outfileAbs) {
  const base = outfileAbs.replaceAll("\\", "/").split("/").pop();
  for (const [outPath, meta] of Object.entries(metafile.outputs)) {
    if (outPath.replaceAll("\\", "/").endsWith(`/${base}`) || outPath.endsWith(base)) {
      return [...(meta.exports ?? [])].sort();
    }
  }
  return [];
}

for (const chunk of reactChunks) {
  const result = await esbuild.build({
    entryPoints: [chunk.entry],
    outfile: chunk.outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    external: chunk.external ?? [],
    logLevel: "info",
    metafile: true,
    plugins: [universeResolvePlugin()],
  });
  let source = readFileSync(chunk.outfile, "utf8");
  source = rewriteExternalRequiresToEsm(source, chunk.external ?? []);
  writeFileSync(chunk.outfile, source);
  const bytes = statSync(chunk.outfile).size;
  sizes[chunk.name] = bytes;
  const file = chunk.outfile.split("/").pop();
  serverChunkExportNames[file] = exportsFromMetafile(
    result.metafile,
    chunk.outfile
  );
  exportsOut.push(
    `export const ${chunk.exportName} = ${JSON.stringify(source)};`,
    ""
  );
  console.log(`wrote ${chunk.outfile} (${bytes} bytes)`);
}

const vendorShared = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser", "import", "module", "default"],
  mainFields: ["module", "browser", "main"],
  logLevel: "info",
  external: NODE_EXTERNALS,
  plugins: [universeResolvePlugin()],
};

const drizzleEntry = join(root, "scripts", "vendor-entries", "drizzle.mjs");
{
  const outfile = join(vendorDir, "drizzle-orm.js");
  const result = await esbuild.build({
    ...vendorShared,
    entryPoints: [drizzleEntry],
    outfile,
    metafile: true,
  });
  const source = readFileSync(outfile, "utf8");
  const bytes = statSync(outfile).size;
  sizes["drizzle-orm"] = bytes;
  serverChunkExportNames["drizzle-orm.js"] = exportsFromMetafile(
    result.metafile,
    outfile
  );
  exportsOut.push(
    `export const KERNEL_DRIZZLE = ${JSON.stringify(source)};`,
    ""
  );
  console.log(`wrote drizzle-orm.js (${bytes} bytes)`);
}

const authEntry = join(root, "scripts", "vendor-entries", "better-auth.mjs");
{
  const outfile = join(vendorDir, "better-auth.js");
  const result = await esbuild.build({
    ...vendorShared,
    entryPoints: [authEntry],
    outfile,
    metafile: true,
    external: [...NODE_EXTERNALS, "drizzle-orm", "drizzle-orm/*"],
    // Flat-vendor plugin must run before universe resolve so drizzle stays external.
    plugins: [
      {
        name: "drizzle-to-flat-vendor",
        setup(build) {
          build.onResolve({ filter: /^drizzle-orm(\/.*)?$/ }, () => ({
            path: "drizzle-orm.js",
            external: true,
          }));
        },
      },
      universeResolvePlugin(),
    ],
  });
  let source = readFileSync(outfile, "utf8");
  source = source.replace(
    /from\s+["']drizzle-orm(?:\/[^"']*)?["']/g,
    'from "drizzle-orm.js"'
  );
  writeFileSync(outfile, source);
  if (source.includes("createRequire(") && source.includes("import.meta.url")) {
    console.warn("WARN: createRequire(import.meta.url) still in better-auth");
  }
  const bytes = Buffer.byteLength(source);
  sizes["better-auth"] = bytes;
  serverChunkExportNames["better-auth.js"] = exportsFromMetafile(
    result.metafile,
    outfile
  );
  exportsOut.push(
    `export const KERNEL_BETTER_AUTH = ${JSON.stringify(source)};`,
    ""
  );
  console.log(`wrote better-auth.js (${bytes} bytes)`);
}

const honoEntry = join(root, "scripts", "vendor-entries", "hono.mjs");
{
  const outfile = join(vendorDir, "hono.js");
  const result = await esbuild.build({
    ...vendorShared,
    entryPoints: [honoEntry],
    outfile,
    metafile: true,
  });
  const source = readFileSync(outfile, "utf8");
  const bytes = Buffer.byteLength(source);
  sizes.hono = bytes;
  serverChunkExportNames["hono.js"] = exportsFromMetafile(result.metafile, outfile);
  exportsOut.push(`export const KERNEL_HONO = ${JSON.stringify(source)};`, "");
  console.log(`wrote hono.js (${bytes} bytes)`);
}

const zodEntry = join(root, "scripts", "vendor-entries", "zod.mjs");
{
  const outfile = join(vendorDir, "zod.js");
  const result = await esbuild.build({
    ...vendorShared,
    entryPoints: [zodEntry],
    outfile,
    metafile: true,
  });
  const source = readFileSync(outfile, "utf8");
  const bytes = Buffer.byteLength(source);
  sizes.zod = bytes;
  serverChunkExportNames["zod.js"] = exportsFromMetafile(result.metafile, outfile);
  exportsOut.push(`export const KERNEL_ZOD = ${JSON.stringify(source)};`, "");
  console.log(`wrote zod.js (${bytes} bytes)`);
}

exportsOut.push(
  `export const KERNEL_VERSION = ${JSON.stringify(KERNEL_VERSION)};`,
  ""
);
writeFileSync(join(generatedDir, "server-kernel.js"), exportsOut.join("\n"));

/** @param {number} n */
function gzipOfFile(name) {
  const raw = readFileSync(join(vendorDir, name));
  return gzipSync(raw).length;
}

const gzipSizes = {
  "react.js": gzipOfFile("react.js"),
  "jsx-runtime.js": gzipOfFile("jsx-runtime.js"),
  "react-dom.js": gzipOfFile("react-dom.js"),
  "react-dom-server.js": gzipOfFile("react-dom-server.js"),
  "drizzle-orm.js": gzipOfFile("drizzle-orm.js"),
  "better-auth.js": gzipOfFile("better-auth.js"),
  "hono.js": gzipOfFile("hono.js"),
  "zod.js": gzipOfFile("zod.js"),
};
const rawTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
const gzipTotal = Object.values(gzipSizes).reduce((a, b) => a + b, 0);

const serverChunks = [
  "react.js",
  "jsx-runtime.js",
  "react-dom.js",
  "react-dom-server.js",
  "drizzle-orm.js",
  "better-auth.js",
  "hono.js",
  "zod.js",
];

/** @type {Record<string, string>} */
const hashes = {};
for (const name of serverChunks) {
  const buf = readFileSync(join(vendorDir, name));
  hashes[name] = `sha256:${createHash("sha256").update(buf).digest("hex")}`;
}

function runScript(name) {
  const result = spawnSync(process.execPath, [join(root, "scripts", name)], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout, result.stderr);
    process.exit(result.status ?? 1);
  }
  if (result.stdout) {
    console.log(result.stdout);
  }
}

runScript("prebuild-types-vfs.mjs");
const typesVfsSizes = JSON.parse(
  readFileSync(join(root, "results", "types-vfs-sizes.json"), "utf8")
);

runScript("prebuild-client.mjs");
const clientSizes = JSON.parse(
  readFileSync(join(root, "results", "client-kernel-sizes.json"), "utf8")
);

runScript("prebuild-css-vfs.mjs");
const cssSizes = JSON.parse(
  readFileSync(join(root, "results", "css-vfs-sizes.json"), "utf8")
);

for (const [file, hash] of Object.entries(clientSizes.hashes ?? {})) {
  hashes[`client/${file}`] = hash;
}

/**
 * Bare server specifiers the LOADER / compile-server rewrite onto flat chunks.
 * Keep in sync with apps/factory/src/compile-server.ts KERNEL_VIRTUAL_MODULES.
 */
const SERVER_IMPORT_MAP = {
  react: "./react.js",
  "react/jsx-runtime": "./jsx-runtime.js",
  "react-dom": "./react-dom.js",
  "react-dom/server": "./react-dom-server.js",
  "drizzle-orm": "./drizzle-orm.js",
  "drizzle-orm/sql": "./drizzle-orm.js",
  "drizzle-orm/sqlite-core": "./drizzle-orm.js",
  "drizzle-orm/d1": "./drizzle-orm.js",
  "better-auth": "./better-auth.js",
  "better-auth/adapters/drizzle": "./better-auth.js",
  "better-auth/plugins": "./better-auth.js",
  hono: "./hono.js",
  "hono/factory": "./hono.js",
  "hono/validator": "./hono.js",
  zod: "./zod.js",
};

/** @type {Record<string, string[]>} */
const serverRuntimeExports = {};
for (const [spec, rel] of Object.entries(SERVER_IMPORT_MAP)) {
  const file = rel.replace(/^\.\//, "");
  serverRuntimeExports[spec] = serverChunkExportNames[file] ?? [];
}

const runtimeExportsBody = [
  "/** AUTO-GENERATED by packages/kernel/scripts/prebuild.mjs — do not edit */",
  "",
  `export const CLIENT_RUNTIME_EXPORTS = ${JSON.stringify(clientSizes.runtimeExports ?? {})};`,
  `export const SERVER_RUNTIME_EXPORTS = ${JSON.stringify(serverRuntimeExports)};`,
  `export const SERVER_IMPORT_MAP = ${JSON.stringify(SERVER_IMPORT_MAP)};`,
  "",
].join("\n");
writeFileSync(join(generatedDir, "runtime-exports.js"), runtimeExportsBody);

const typesGzip = typesVfsSizes.vfsJsonGzipBytes ?? 0;
const clientGzip = clientSizes.totals?.gzip ?? 0;
const cssGzip = cssSizes.gzipBytes ?? 0;
const hostBakeGzip = gzipTotal + typesGzip + clientGzip + cssGzip;

const kernelJson = {
  version: KERNEL_VERSION,
  pins: PINS,
  serverChunks,
  clientChunks: clientSizes.clientChunks ?? [],
  importMap: clientSizes.importMap ?? {},
  clientBailouts: clientSizes.bailouts ?? [],
  hashes,
  typesVfs: {
    fileCount: typesVfsSizes.vfsFileCount,
    rawBytes: typesVfsSizes.vfsRawBytes,
    gzipBytes: typesGzip,
    packages: typesVfsSizes.packageTypeCounts,
  },
  cssVfs: {
    entries: cssSizes.entries ?? 0,
    rawBytes: cssSizes.rawBytes ?? 0,
    gzipBytes: cssGzip,
  },
  sizesRaw: sizes,
  sizesGzip: gzipSizes,
  clientSizesRaw: clientSizes.sizesRaw,
  clientSizesGzip: clientSizes.sizesGzip,
  totals: {
    raw: rawTotal + (clientSizes.totals?.raw ?? 0),
    gzip: gzipTotal + clientGzip,
    typesGzip,
    cssGzip,
    clientGzip,
    hostBakeGzip,
  },
  killThresholdGzip: 10 * 1024 * 1024,
  underGzipKill: hostBakeGzip < 10 * 1024 * 1024,
  note: `kernel@${KERNEL_VERSION} — server + types VFS + client chunks + CSS VFS`,
};

const kernelJsonText = `${JSON.stringify(kernelJson, null, 2)}\n`;
writeFileSync(join(vendorDir, "manifest.json"), kernelJsonText);
writeFileSync(join(root, "kernel.json"), kernelJsonText);
writeFileSync(join(root, "results", "kernel-sizes.json"), kernelJsonText);

console.log("kernel totals:", kernelJson.totals);
console.log("wrote kernel.json + vendor/manifest.json + src/generated/*");
