/**
 * Node host for `@sfab-lite/verbs` (D-005 consume recipe).
 *
 * Workers bundlers resolve the package's raw-TS `.js` specifiers; Node
 * does not. This runner esbuild-bundles an entry, aliasing
 * `@sfab-lite/verbs` and `@sfab-lite/core` to their `src/` dirs, keeping
 * `typescript` and `@sfab-lite/kernel` external, and compiling
 * `@biomejs/wasm-web` `.wasm` to a `WebAssembly.Module` (Workers module
 * rules; Node has no such import).
 *
 * Outfile must sit inside the package that *declares* those two
 * externals. Node ESM resolves externals from the outfile path, not
 * cwd. A consumer writes `app/.tmp/…`; this repo's CI gate writes
 * `framework/verbs/.tmp/…`.
 *
 *   import { bundle, locateSrc } from "./run.mjs"
 *   node run.mjs proof-lint.ts <path-to-seed.json>
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = /\.wasm$/;
const ANY_PATH = /.*/;

/**
 * @param {NodeJS.Require} resRequire
 */
export function wasmAsModulePlugin(resRequire) {
  return {
    name: "wasm-as-webassembly-module",
    /** @param {{ onResolve: Function, onLoad: Function }} b */
    setup(b) {
      b.onResolve({ filter: WASM_PATH }, (args) => {
        const resolved = resRequire.resolve(args.path, {
          paths: [args.resolveDir],
        });
        return { path: resolved, namespace: "wasm-module" };
      });
      b.onLoad({ filter: ANY_PATH, namespace: "wasm-module" }, (args) => ({
        contents: `
        import { readFileSync } from "node:fs";
        export default new WebAssembly.Module(readFileSync(${JSON.stringify(args.path)}));
      `,
        loader: "js",
      }));
    },
  };
}

/**
 * @param {NodeJS.Require} resRequire
 * @returns {{ verbsSrc: string, coreSrc: string }}
 */
export function locateSrc(resRequire) {
  return {
    verbsSrc: join(dirname(resRequire.resolve("@sfab-lite/verbs/lint")), ".."),
    coreSrc: dirname(resRequire.resolve("@sfab-lite/core/validate-manifest")),
  };
}

/**
 * @param {{
 *   esbuild: { build: Function }
 *   entry: string
 *   outfile: string
 *   verbsSrc: string
 *   coreSrc: string
 *   require: NodeJS.Require
 * }} opts
 */
export async function bundle(opts) {
  const { esbuild, entry, outfile, verbsSrc, coreSrc } = opts;
  mkdirSync(dirname(outfile), { recursive: true });
  return await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    metafile: true,
    external: ["typescript", "@sfab-lite/kernel"],
    alias: {
      "@sfab-lite/verbs": verbsSrc,
      "@sfab-lite/core": coreSrc,
    },
    plugins: [wasmAsModulePlugin(opts.require)],
  });
}

const invokedAsCli =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsCli) {
  const entryName = process.argv[2];
  if (!entryName) {
    console.error("usage: node run.mjs proof-foo.ts [args...]");
    process.exit(2);
  }
  const appRequire = createRequire(join(here, "package.json"));
  const { build } = appRequire("esbuild");
  const { verbsSrc, coreSrc } = locateSrc(appRequire);
  const outDir = join(here, ".tmp");
  const outfile = join(outDir, entryName.replace(/\.ts$/, ".mjs"));
  const result = await bundle({
    esbuild: { build },
    entry: join(here, entryName),
    outfile,
    verbsSrc,
    coreSrc,
    require: appRequire,
  });
  writeFileSync(
    join(outDir, entryName.replace(/\.ts$/, ".meta.json")),
    JSON.stringify(result.metafile, null, 2)
  );
  const run = spawnSync(
    process.execPath,
    [outfile, ...process.argv.slice(3)],
    { stdio: "inherit", cwd: here }
  );
  process.exit(run.status ?? 1);
}
