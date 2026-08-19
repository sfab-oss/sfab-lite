#!/usr/bin/env node
/**
 * Fail if any starter's `generated/seed.json` has drifted from its app source.
 *
 * The seed is a committed build artifact: the factory Worker has no
 * filesystem, so the source tree a new app starts as ships as a bundle
 * constant. Same shape as `check:kernel` — re-run the generator and compare.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const startersRoot = join(repoRoot, "starters");

const starterIds = readdirSync(startersRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = false;

for (const id of starterIds) {
  const packScript = join(startersRoot, id, "scripts/pack.mjs");
  const committedPath = join(startersRoot, id, "generated/seed.json");
  const pkg = JSON.parse(
    readFileSync(join(startersRoot, id, "package.json"), "utf8")
  );

  const packed = spawnSync(process.execPath, [packScript], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (packed.status !== 0) {
    process.stderr.write(packed.stderr ?? "");
    console.error(`check:seed — starters/${id} pack.mjs failed.`);
    failed = true;
    continue;
  }

  const committed = readFileSync(committedPath, "utf8");
  if (packed.stdout === committed) {
    console.log(`check:seed — starters/${id}/generated/seed.json matches.`);
    continue;
  }

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

  console.error(`check:seed — starters/${id}/generated/seed.json is stale.`);
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
  console.error(`\n  Fix: pnpm --filter ${pkg.name} bake-seed`);
  failed = true;
}

if (failed) {
  process.exit(1);
}
