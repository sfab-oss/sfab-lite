#!/usr/bin/env node
/**
 * Assemble the whole registry catalog into the ERP starter via `planAdd`,
 * then write provenance onto starters/erp/manifest.json `recipes`.
 *
 * The starter is the whole catalog by definition; `check:manifest` fails
 * when the committed tree or provenance drifts from this assembly.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../../framework/toolchain/src/validate-manifest.ts";
import { CATALOG } from "../src/catalog.ts";
import { assembleAll } from "../src/lite.ts";

const registryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = join(registryRoot, "../starters/erp");
const appRoot = join(packageRoot, "app");
const manifestPath = join(packageRoot, "manifest.json");

const assembled = assembleAll(CATALOG);
if (!assembled.ok) {
  console.error(`assemble-erp-starter: ${assembled.name}: ${assembled.error}`);
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
    `assemble-erp-starter: manifest.recipes failed v0: ${validated.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")}`
  );
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(validated.manifest, null, 2)}\n`);
console.log(
  `assemble-erp-starter: ${Object.keys(assembled.provenance).join(", ")} → ${Object.keys(assembled.writes).length} files`
);
