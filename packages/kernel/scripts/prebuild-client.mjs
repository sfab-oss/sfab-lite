/**
 * Browser client kernel chunks for import-map sharing.
 * Emits vendor/client/*.js + src/generated/client-kernel.js.
 * Size summary folds into kernel.json via prebuild.mjs.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "vendor", "client");
const shimDir = join(root, "scripts", ".shims-client");
const generatedDir = join(root, "src", "generated");
const require = createRequire(import.meta.url);

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

/** Rewrite esbuild CJS stubs to flat client keys. */
function rewriteExternalRequires(source, external) {
  if (!external.length) {
    return source;
  }
  const imports = [];
  const map = [];
  for (const spec of external) {
    const id = spec.replace(/[^a-zA-Z0-9]/g, "_");
    const flat =
      spec === "react"
        ? "react.js"
        : spec === "react-dom"
          ? "react-dom.js"
          : spec === "react/jsx-runtime"
            ? "jsx-runtime.js"
            : spec;
    imports.push(`import __ext_${id} from ${JSON.stringify(flat)};`);
    map.push(
      `  if (x === ${JSON.stringify(spec)}) return __ext_${id}?.default ?? __ext_${id};`
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

for (const chunk of chunks) {
  await esbuild.build({
    ...browserShared,
    entryPoints: [chunk.entry],
    outfile: chunk.outfile,
    external: chunk.external ?? [],
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
  console.log(`client wrote ${file} (${bytes} bytes)`);
}

/** Helper: vendor a package entry to a flat client chunk. */
async function vendorPkg(opts) {
  const { name, entrySource, outfileName, external = [], importKeys } = opts;
  const entry = join(shimDir, `${outfileName.replace(/\.js$/, "")}.entry.mjs`);
  writeFileSync(entry, entrySource);
  const outfile = join(outDir, outfileName);
  try {
    await esbuild.build({
      ...browserShared,
      entryPoints: [entry],
      outfile,
      external,
      plugins: external.length
        ? [
            {
              name: "flat-client-externals",
              setup(build) {
                build.onResolve(
                  {
                    filter: /^(react|react-dom|react\/jsx-runtime)(\/.*)?$/,
                  },
                  (args) => {
                    const flat =
                      args.path === "react"
                        ? "react.js"
                        : args.path === "react-dom" ||
                            args.path.startsWith("react-dom/")
                          ? args.path === "react-dom/client"
                            ? "react-dom-client.js"
                            : "react-dom.js"
                          : args.path === "react/jsx-runtime"
                            ? "jsx-runtime.js"
                            : args.path;
                    return { path: flat, external: true };
                  }
                );
              },
            },
          ]
        : [],
    });
    let source = readFileSync(outfile, "utf8");
    source = source
      .replace(/from\s+["']react["']/g, 'from "react.js"')
      .replace(/from\s+["']react\/jsx-runtime["']/g, 'from "jsx-runtime.js"')
      .replace(
        /from\s+["']react-dom\/client["']/g,
        'from "react-dom-client.js"'
      )
      .replace(/from\s+["']react-dom["']/g, 'from "react-dom.js"');
    writeFileSync(outfile, source);
    const bytes = Buffer.byteLength(source);
    sizesRaw[name] = bytes;
    clientChunkFiles.push(outfileName);
    hashes[outfileName] =
      `sha256:${createHash("sha256").update(source).digest("hex")}`;
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

// @base-ui: large / deep — intentional per-dep bailout to app bundle (B)
bailouts.push("@base-ui/react/* → bundle into app (B)");

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

const summary = {
  clientChunks: clientChunkFiles,
  importMap,
  hashes,
  sizesRaw,
  sizesGzip,
  totals: { raw, gzip },
  bailouts,
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
