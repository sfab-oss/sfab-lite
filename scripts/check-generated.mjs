#!/usr/bin/env node
/**
 * Drift gate for the four generated format files under starters/erp/app/.
 *
 * Committed bytes must equal generateFormatFiles(starter manifest, current
 * pins). Failure names the file and says to regenerate, not hand-edit.
 * check:manifest keeps owning manifest.recipes — do not merge the gates.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT_PINS } from "../framework/runtime/scripts/pins.mjs";
import { generateFormatFiles } from "../framework/toolchain/src/generate-format-files.ts";
import { validateManifest } from "../framework/toolchain/src/validate-manifest.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const starterPath = join(repoRoot, "starters/erp/manifest.json");
const appRoot = join(repoRoot, "starters/erp/app");

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`check:generated — cannot read ${path}: ${err.message}`);
    process.exit(1);
  }
}

const starter = load(starterPath);
const validated = validateManifest(starter);
if (!validated.ok) {
  console.error(
    "check:generated — starters/erp/manifest.json failed v0 schema (run check:manifest)"
  );
  process.exit(1);
}

const expected = generateFormatFiles(validated.manifest, FORMAT_PINS);
const failures = [];
for (const [rel, want] of Object.entries(expected)) {
  let got;
  try {
    got = readFileSync(join(appRoot, rel), "utf8");
  } catch {
    failures.push(`${rel}: missing — regenerate, do not hand-edit`);
    continue;
  }
  if (got !== want) {
    failures.push(`${rel}: regenerate, do not hand-edit`);
  }
}

if (failures.length > 0) {
  console.error(
    "check:generated — committed files drifted from the generator:"
  );
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}

console.log(
  `generated ok: ${Object.keys(expected).join(", ")} match generateFormatFiles`
);
