/**
 * Bundle + run the check-units behavioural proof.
 *
 *   node scripts/proof-check-units.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "../..");
const esbuild = join(
  repoRoot,
  "framework/runtime/universe/node_modules/esbuild/bin/esbuild"
);
const entry = join(here, "proof-check-units.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "proof-check-units.mjs");

mkdirSync(outDir, { recursive: true });

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
    "--packages=external",
  ],
  { stdio: "inherit", cwd: appRoot }
);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const run = spawnSync(process.execPath, [outfile], {
  stdio: "inherit",
  cwd: appRoot,
  env: process.env,
});
process.exit(run.status ?? 1);
