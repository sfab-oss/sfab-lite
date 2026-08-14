#!/usr/bin/env node
/**
 * Assemble published registry recipes into the ERP starter via `planAdd`,
 * then write provenance onto starters/erp/manifest.json `recipes`.
 *
 * This is how the starter is composed — not a parallel copy of the recipes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../../framework/toolchain/src/validate-manifest.ts";
import { CATALOG } from "../src/catalog.ts";
import { catalogNames, planAdd } from "../src/lite.ts";

const registryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(registryRoot, "../starters/erp");
const appRoot = join(packageRoot, "app");
const manifestPath = join(packageRoot, "manifest.json");

const existing = {};
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

let recipes = { ...(manifest.recipes ?? {}) };

for (const name of catalogNames(CATALOG)) {
  const planned = planAdd(name, CATALOG, existing);
  if (!planned.ok) {
    console.error(`assemble-erp-starter: ${name}: ${planned.error}`);
    process.exit(1);
  }
  for (const [path, content] of Object.entries(planned.writes)) {
    existing[path] = content;
    const abs = join(appRoot, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  recipes = { ...recipes, ...planned.provenance };
}

const next = { ...manifest, recipes };
const validated = validateManifest(next);
if (!validated.ok) {
  console.error(
    `assemble-erp-starter: manifest.recipes failed v0: ${validated.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")}`
  );
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(validated.manifest, null, 2)}\n`);
console.log(
  `assemble-erp-starter: ${catalogNames(CATALOG).join(", ")} → ${Object.keys(recipes).length} provenance keys`
);
