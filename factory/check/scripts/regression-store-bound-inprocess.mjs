/**
 * Bundle + run the in-process LS-store bound regression.
 *
 *   node scripts/regression-store-bound-inprocess.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERBS_BUNDLE_FLAGS } from "./esbuild-proof-flags.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "../..");
const esbuild = join(
  repoRoot,
  "framework/runtime/universe/node_modules/esbuild/bin/esbuild"
);
const entry = join(here, "regression-store-bound-inprocess.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "regression-store-bound-inprocess.mjs");

mkdirSync(outDir, { recursive: true });

// The universe is a separate mini-workspace, so a plain root install does not
// populate it. Ensure it here rather than depending on `check:kernel` having
// run first — CI runs every gate even when an earlier one fails, so ordering
// is not something this script may assume.
if (!existsSync(esbuild)) {
  const ensure = spawnSync(
    process.execPath,
    [join(repoRoot, "framework/runtime/scripts/ensure-universe.mjs")],
    { stdio: "inherit", cwd: repoRoot }
  );
  if (ensure.status !== 0) {
    process.exit(ensure.status ?? 1);
  }
}

const build = spawnSync(
  esbuild,
  [
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outfile}`,
    ...VERBS_BUNDLE_FLAGS,
  ],
  { stdio: "inherit", cwd: appRoot }
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// --expose-gc: the heap assertion must read retained memory, not floating
// garbage, or it reports whatever the collector happened not to have run on.
const run = spawnSync(process.execPath, ["--expose-gc", outfile], {
  stdio: "inherit",
  cwd: appRoot,
});
process.exit(run.status ?? 1);
