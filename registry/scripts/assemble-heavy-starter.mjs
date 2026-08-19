#!/usr/bin/env node
/**
 * Copy `HEAVY_SEED_RECIPES` into the heavy starter via `planAdd`, then write
 * provenance onto starters/heavy/manifest.json `recipes`.
 *
 * `check:manifest` fails when the committed tree or provenance drifts from
 * this assembly.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../../framework/toolchain/src/validate-manifest.ts";
import { CATALOG } from "../src/catalog.ts";
import { HEAVY_SEED_RECIPES } from "../src/heavy-seed.ts";
import { assemble } from "../src/lite.ts";

const registryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(registryRoot, "../starters/heavy");
const appRoot = join(packageRoot, "app");
const manifestPath = join(packageRoot, "manifest.json");

const assembled = assemble(CATALOG, HEAVY_SEED_RECIPES);
if (!assembled.ok) {
  console.error(
    `assemble-heavy-starter: ${assembled.name}: ${assembled.error}`
  );
  process.exit(1);
}

for (const [path, content] of Object.entries(assembled.writes)) {
  const abs = join(appRoot, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const validated = validateManifest({
  ...manifest,
  recipes: assembled.provenance,
});
if (!validated.ok) {
  console.error(
    `assemble-heavy-starter: manifest.recipes failed v0: ${validated.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")}`
  );
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(validated.manifest, null, 2)}\n`);
console.log(
  `assemble-heavy-starter: ${Object.keys(assembled.provenance).join(", ")} → ${Object.keys(assembled.writes).length} files`
);
