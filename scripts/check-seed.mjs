#!/usr/bin/env node
/**
 * Fail if `apps/factory/src/generated/seed.json` has drifted from the template
 * source it is baked from.
 *
 * The seed is a committed build artifact: the factory Worker has no
 * filesystem, so the source tree a new app starts as ships as a bundle
 * constant. Nothing else in the repo compares the two, which means editing
 * `packages/template/app/src` and forgetting `pnpm --filter @sfab-lite/factory
 * bake-seed` leaves every gate green while the factory keeps seeding the old
 * source. That happened: commit 8a39d9d changed `public-base.ts` and the
 * committed seed still carried the pre-change text.
 *
 * Same shape as `check:kernel` — re-run the generator and compare bytes. The
 * generator is the authority; this only asserts the committed copy matches.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packScript = join(repoRoot, "packages/template/scripts/pack.mjs");
const committedPath = join(repoRoot, "apps/factory/src/generated/seed.json");

const packed = spawnSync(process.execPath, [packScript], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (packed.status !== 0) {
  process.stderr.write(packed.stderr ?? "");
  console.error("check:seed — pack.mjs failed; cannot verify the seed.");
  process.exit(packed.status ?? 1);
}

const committed = readFileSync(committedPath, "utf8");
if (packed.stdout === committed) {
  console.log("check:seed — seed.json matches the template source.");
  process.exit(0);
}

// Byte equality is the gate, but a bare "they differ" is not actionable, so
// name the files whose contents moved.
const fresh = JSON.parse(packed.stdout);
const old = JSON.parse(committed);
const paths = new Set([
  ...Object.keys(old.sourceFiles),
  ...Object.keys(fresh.sourceFiles),
]);
const changed = [...paths].filter(
  (p) => old.sourceFiles[p] !== fresh.sourceFiles[p]
);

function stateOf(path) {
  if (old.sourceFiles[path] === undefined) {
    return "added";
  }
  if (fresh.sourceFiles[path] === undefined) {
    return "removed";
  }
  return "modified";
}

console.error("check:seed — apps/factory/src/generated/seed.json is stale.");
if (changed.length > 0) {
  console.error(`  ${changed.length} source file(s) differ:`);
  for (const p of changed.sort()) {
    console.error(`    ${stateOf(p).padEnd(8)} ${p}`);
  }
}
if (JSON.stringify(old.migrations) !== JSON.stringify(fresh.migrations)) {
  console.error("  migrations differ");
}
if (JSON.stringify(old.manifest) !== JSON.stringify(fresh.manifest)) {
  console.error("  manifest differs");
}
console.error("\n  Fix: pnpm --filter @sfab-lite/factory bake-seed");
process.exit(1);
