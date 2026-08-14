/**
 * Bundle + run the check-worker heap measurement.
 *
 *   node scripts/measure-memory.mjs        # 4 apps
 *   APPS=2 node scripts/measure-memory.mjs
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
  "framework/runtime/universe/node_modules/esbuild/bin/esbuild"
);
const entry = join(here, "measure-memory.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "measure-memory.mjs");

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

// --expose-gc so the readings are of retained memory, not uncollected garbage.
const run = spawnSync(process.execPath, ["--expose-gc", outfile], {
  stdio: "inherit",
  cwd: appRoot,
});
process.exit(run.status ?? 1);
