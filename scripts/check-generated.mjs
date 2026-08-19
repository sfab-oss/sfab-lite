#!/usr/bin/env node
/**
 * Drift gate for generated format files under every starters/<id>/app/.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT_PINS } from "../framework/runtime/scripts/pins.mjs";
import { generateFormatFiles } from "../framework/toolchain/src/generate-format-files.ts";
import { validateManifest } from "../framework/toolchain/src/validate-manifest.ts";
import { LITE_REGISTRY_URL_PATTERN } from "../registry/src/pin.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const startersRoot = join(repoRoot, "starters");

const starterIds = readdirSync(startersRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = false;

for (const id of starterIds) {
  const starterPath = join(startersRoot, id, "manifest.json");
  const appRoot = join(startersRoot, id, "app");
  let starter;
  try {
    starter = JSON.parse(readFileSync(starterPath, "utf8"));
  } catch (err) {
    console.error(
      `check:generated — cannot read ${starterPath}: ${err.message}`
    );
    failed = true;
    continue;
  }

  const validated = validateManifest(starter);
  if (!validated.ok) {
    console.error(
      `check:generated — starters/${id}/manifest.json failed v0 schema (run check:manifest)`
    );
    failed = true;
    continue;
  }

  const expected = generateFormatFiles(validated.manifest, FORMAT_PINS, {
    registryUrl: LITE_REGISTRY_URL_PATTERN,
  });
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
      `check:generated — starters/${id} drifted from the generator:`
    );
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    failed = true;
    continue;
  }

  console.log(
    `generated ok: starters/${id} ${Object.keys(expected).join(", ")}`
  );
}

if (failed) {
  process.exit(1);
}
