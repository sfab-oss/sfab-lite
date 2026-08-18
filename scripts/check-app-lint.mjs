#!/usr/bin/env node
/**
 * Fail if any starter's `app/src` is dirty under the app Biome config
 * (`framework/toolchain/app-biome.json`) — the same config the lint worker
 * applies to a freshly seeded app.
 *
 * Walks `starters/` so a new starter cannot skip this gate.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const startersRoot = join(repoRoot, "starters");

const starterIds = readdirSync(startersRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (starterIds.length === 0) {
  console.error("check:app-lint — no directories under starters/");
  process.exit(1);
}

const srcDirs = [];
for (const id of starterIds) {
  const rel = join("starters", id, "app/src");
  if (!existsSync(join(repoRoot, rel))) {
    console.error(`check:app-lint — ${rel} missing.`);
    process.exit(1);
  }
  srcDirs.push(rel);
}

const result = spawnSync(
  "biome",
  ["check", "--config-path=framework/toolchain/app-biome.json", ...srcDirs],
  { cwd: repoRoot, stdio: "inherit", shell: false }
);

process.exit(result.status === 0 ? 0 : (result.status ?? 1));
