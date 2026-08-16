/**
 * Bundle + run a measure-*.ts next to this file.
 *
 *   node scripts/run-measure.mjs measure-stub-vfs.ts
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
const entryName = process.argv[2];
if (!entryName) {
  console.error("usage: node scripts/run-measure.mjs measure-foo.ts");
  process.exit(2);
}
const entry = join(here, entryName);
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, entryName.replace(/\.ts$/, ".mjs"));

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

const extra = process.argv.slice(3);
const run = spawnSync(process.execPath, ["--expose-gc", outfile, ...extra], {
  stdio: "inherit",
  cwd: appRoot,
  env: process.env,
});
process.exit(run.status ?? 1);
