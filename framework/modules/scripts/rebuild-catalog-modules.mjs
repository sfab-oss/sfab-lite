#!/usr/bin/env node
/**
 * Rebuild every catalog pin, then assemble catalog-modules.json.
 * This is the check:modules fix command.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PINS, pinSpec } from "./pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const buildModule = join(here, "build-module.mjs");
const assemble = join(here, "assemble-catalog.mjs");

function run(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const pin of CATALOG_PINS) {
  run(buildModule, [`--pin=${pinSpec(pin)}`]);
}
run(assemble);
