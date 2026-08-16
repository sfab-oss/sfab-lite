/**
 * Bundle + run the in-process delete→re-add regression.
 *
 *   node scripts/regression-delete-readd-inprocess.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
const entry = join(here, "regression-delete-readd-inprocess.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "regression-delete-readd-inprocess.mjs");

mkdirSync(outDir, { recursive: true });

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

const run = spawnSync(process.execPath, [outfile], {
  stdio: "inherit",
  cwd: appRoot,
});
process.exit(run.status ?? 1);
