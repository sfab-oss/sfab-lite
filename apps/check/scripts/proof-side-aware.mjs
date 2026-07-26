/**
 * Bundle + run the side-aware resolution behavioural proof.
 *
 *   node scripts/proof-side-aware.mjs
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
  "packages/kernel/universe/node_modules/esbuild/bin/esbuild"
);
const entry = join(here, "proof-side-aware.ts");
const outDir = join(appRoot, ".tmp");
const outfile = join(outDir, "proof-side-aware.mjs");

mkdirSync(outDir, { recursive: true });

if (!existsSync(esbuild)) {
  const ensure = spawnSync(
    process.execPath,
    [join(repoRoot, "packages/kernel/scripts/ensure-universe.mjs")],
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
});
process.exit(run.status ?? 1);
