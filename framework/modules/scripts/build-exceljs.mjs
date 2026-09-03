#!/usr/bin/env node
/**
 * Build the exceljs catalog artifact only. Does not write catalog-modules.json.
 * After a pin rebuild, run assemble-catalog.mjs (or rebuild-catalog-modules.mjs).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const forwarded = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--catalog-json="));
const result = spawnSync(
  process.execPath,
  [join(here, "build-module.mjs"), "--pin=exceljs@4.4.0", ...forwarded],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
