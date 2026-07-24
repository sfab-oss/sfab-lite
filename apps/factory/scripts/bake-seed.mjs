#!/usr/bin/env node
/**
 * Bake `@sfab-lite/template` pack output into `src/generated/seed.json`.
 * The factory Worker has no filesystem — the seed must be a bundle constant.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const factoryRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(factoryRoot, "../..");
const packScript = join(repoRoot, "packages/template/scripts/pack.mjs");
const out = join(factoryRoot, "src/generated/seed.json");

const result = spawnSync(process.execPath, [packScript, `--out=${out}`], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "inherit", "inherit"],
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
