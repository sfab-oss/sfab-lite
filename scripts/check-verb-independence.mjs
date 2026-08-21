#!/usr/bin/env node
/**
 * Verb-level independence (D-005) as a CI contract.
 *
 * A consumer of `framework/*` as libraries — no `factory/` in the load
 * graph — must validate a starter manifest and run `lint` + `check`
 * against `starters/base`. The Node load path still esbuild-bundles
 * verbs (raw-TS `.js` specifiers); that is the documented consumer
 * recipe, not a factory import.
 *
 * Red fixture: bundling scripts/fixtures/verb-red/leak.ts must show a
 * `factory/` input, or the detector is blind.
 *
 * CI-only — runCheck on the base seed is ~10s and needs the kernel
 * universe (esbuild). Not in pre-commit.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const verbsRequire = createRequire(
  join(repoRoot, "framework/verbs/package.json")
);
const coreRequire = createRequire(
  join(repoRoot, "framework/toolchain/package.json")
);
const kernelRequire = createRequire(
  join(repoRoot, "framework/runtime/package.json")
);
const CONSUMER = join(here, "fixtures/verb-consumer");
const RED_LEAK = join(here, "fixtures/verb-red/leak.ts");
const BASE_MANIFEST = join(repoRoot, "starters/base/manifest.json");
const BASE_SEED = join(repoRoot, "starters/base/generated/seed.json");
const UNIVERSE_PKG = join(repoRoot, "framework/runtime/universe/package.json");
const ESBUILD_DIR = join(
  repoRoot,
  "framework/runtime/universe/node_modules/esbuild"
);

const PACKAGE_IDS = [
  {
    id: "@sfab-lite/core/validate-manifest",
    resolve: (id) => coreRequire.resolve(id),
  },
  {
    id: "@sfab-lite/verbs/lint",
    resolve: (id) => verbsRequire.resolve(id),
  },
  {
    id: "@sfab-lite/verbs/check",
    resolve: (id) => verbsRequire.resolve(id),
  },
  { id: "@sfab-lite/kernel", resolve: (id) => kernelRequire.resolve(id) },
];
const WASM_PATH = /\.wasm$/;
const ANY_PATH = /.*/;

/** @param {string} p */
function posixRel(p) {
  return p.replaceAll("\\", "/");
}

/** @param {string} p */
function hasFactorySegment(p) {
  return posixRel(p).split("/").includes("factory");
}

function loadEsbuild() {
  if (!(existsSync(UNIVERSE_PKG) && existsSync(ESBUILD_DIR))) {
    return null;
  }
  try {
    return createRequire(UNIVERSE_PKG)("esbuild");
  } catch {
    return null;
  }
}

function wasmAsModulePlugin() {
  return {
    name: "wasm-as-webassembly-module",
    /** @param {{ onResolve: Function, onLoad: Function }} b */
    setup(b) {
      b.onResolve({ filter: WASM_PATH }, (args) => {
        const resolved = verbsRequire.resolve(args.path, {
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
 * @param {{ id: string, resolve: (id: string) => string }} entry
 * @returns {{ id: string, rel: string }}
 */
function resolvedFrameworkEntry(entry) {
  const { id, resolve } = entry;
  let resolved;
  try {
    resolved = resolve(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`check:verb-independence — cannot resolve ${id}: ${msg}`);
    process.exit(1);
  }
  const rel = posixRel(relative(repoRoot, realpathSync(resolved)));
  if (rel.startsWith("..") || !rel.startsWith("framework/")) {
    console.error(
      `check:verb-independence — ${id} resolved outside framework/: ${rel}`
    );
    process.exit(1);
  }
  if (hasFactorySegment(rel)) {
    console.error(
      `check:verb-independence — ${id} resolved under factory/: ${rel}`
    );
    process.exit(1);
  }
  return { id, rel };
}

/**
 * @param {{
 *   build: (opts: Record<string, unknown>) => Promise<{ metafile: { inputs: Record<string, unknown> } }>
 * }} esbuild
 * @param {string} entry
 * @param {string} outfile
 */
async function bundleEntry(esbuild, entry, outfile) {
  const verbsSrc = join(
    dirname(verbsRequire.resolve("@sfab-lite/verbs/lint")),
    ".."
  );
  const coreSrc = dirname(
    coreRequire.resolve("@sfab-lite/core/validate-manifest")
  );
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
    plugins: [wasmAsModulePlugin()],
  });
}

/** @param {Record<string, unknown>} inputs */
function factoryInputs(inputs) {
  return Object.keys(inputs).filter((p) => hasFactorySegment(p));
}

/**
 * @param {{
 *   build: (opts: Record<string, unknown>) => Promise<{ metafile: { inputs: Record<string, unknown> } }>
 * }} esbuild
 * @param {string} entry
 * @param {string} outfile
 * @param {boolean} expectFactory
 */
async function bundleAndCheckGraph(esbuild, entry, outfile, expectFactory) {
  const result = await bundleEntry(esbuild, entry, outfile);
  const leaks = factoryInputs(result.metafile.inputs);
  if (expectFactory) {
    if (leaks.length === 0) {
      console.error(
        `check:verb-independence — red fixture ${posixRel(relative(repoRoot, entry))} bundled with no factory/ input (detector is blind)`
      );
      process.exit(1);
    }
    console.log(
      `verb-independence red fixture ok: factory/ in graph (${posixRel(relative(repoRoot, leaks[0] ?? entry))})`
    );
    return;
  }
  if (leaks.length > 0) {
    console.error(
      `check:verb-independence — factory/ in ${posixRel(relative(repoRoot, entry))} graph:`
    );
    for (const p of leaks.slice(0, 10)) {
      console.error(`  ${posixRel(relative(repoRoot, p))}`);
    }
    process.exit(1);
  }
}

/**
 * @param {string[]} argv
 * @param {string} cwd
 */
function runNode(argv, cwd) {
  const child = spawnSync(process.execPath, argv, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (child.stdout) {
    process.stdout.write(child.stdout);
  }
  if (child.stderr) {
    process.stderr.write(child.stderr);
  }
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

const { values } = parseArgs({
  options: {
    "expect-factory": { type: "boolean", default: false },
  },
});

const esbuild = loadEsbuild();
if (!esbuild) {
  console.error(
    "check:verb-independence — kernel universe is not installed (need esbuild).\n" +
      "Run: pnpm --filter @sfab-lite/kernel install-universe"
  );
  process.exit(2);
}

const outDir = mkdtempSync(join(tmpdir(), "verb-independence-"));
// Bundles that keep `@sfab-lite/kernel` and `typescript` external must
// live under a workspace package so Node's ESM walk finds them.
const runDir = join(repoRoot, "framework/verbs/.tmp");
mkdirSync(runDir, { recursive: true });

if (values["expect-factory"]) {
  await bundleAndCheckGraph(esbuild, RED_LEAK, join(outDir, "leak.mjs"), true);
  process.exit(0);
}

for (const entry of PACKAGE_IDS) {
  const { id, rel } = resolvedFrameworkEntry(entry);
  console.log(`resolve ${id} -> ${rel}`);
}

const red = spawnSync(
  process.execPath,
  [fileURLToPath(import.meta.url), "--expect-factory"],
  { encoding: "utf8", cwd: repoRoot, env: process.env }
);
if (red.status !== 0) {
  process.stderr.write(red.stderr ?? "");
  process.stdout.write(red.stdout ?? "");
  console.error(
    `check:verb-independence — red fixture exited ${red.status}, expected 0`
  );
  process.exit(1);
}
process.stdout.write(red.stdout ?? "");

{
  const href = pathToFileURL(
    realpathSync(coreRequire.resolve("@sfab-lite/core/validate-manifest"))
  ).href;
  const { validateManifest } = await import(href);
  const input = JSON.parse(readFileSync(BASE_MANIFEST, "utf8"));
  const result = validateManifest(input);
  if (!result.ok) {
    console.error("check:verb-independence — manifest validate failed");
    for (const i of result.issues) {
      console.error(`  ${i.path}: ${i.message}`);
    }
    process.exit(1);
  }
  console.log(
    "MANIFEST-VALIDATE PASS:",
    JSON.stringify({
      name: result.manifest.name,
      format: result.manifest.format,
      adapter: result.manifest.adapter,
      recipes: Object.keys(result.manifest.recipes ?? {}).length,
    })
  );
}

const lintOut = join(runDir, "proof-lint.mjs");
await bundleAndCheckGraph(
  esbuild,
  join(CONSUMER, "proof-lint.ts"),
  lintOut,
  false
);
runNode([lintOut, BASE_SEED], repoRoot);

const checkOut = join(runDir, "proof-check.mjs");
await bundleAndCheckGraph(
  esbuild,
  join(CONSUMER, "proof-check.ts"),
  checkOut,
  false
);
runNode([checkOut, BASE_SEED], repoRoot);

console.log(
  "verb-independence ok (resolve + red fixture + manifest + lint + check, no factory/ in graph)"
);
