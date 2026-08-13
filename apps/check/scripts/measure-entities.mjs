/**
 * Bundle + run the entities-only / affected-file heap measurement.
 *
 *   node scripts/measure-entities.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "../..");
const esbuild = join(
  repoRoot,
  "packages/kernel/universe/node_modules/esbuild/bin/esbuild"
);
const entry = join(here, "measure-entities.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "measure-entities.mjs");

mkdirSync(outDir, { recursive: true });

const build = spawnSync(
  esbuild,
  [
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outfile}`,
    "--packages=external",
  ],
  { stdio: "inherit", cwd: appRoot }
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const run = spawnSync(process.execPath, ["--expose-gc", outfile], {
  stdio: "inherit",
  cwd: appRoot,
});
process.exit(run.status ?? 1);
