#!/usr/bin/env node
/**
 * Manifest v0 schema gate for every starters/<id>, plus the red fixture.
 *
 * Each starter's committed recipes must match assemble(CATALOG, <SEED_RECIPES>)
 * and every recipe file on disk must still hash to it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../framework/toolchain/src/validate-manifest.ts";
import { BASE_SEED_RECIPES } from "../registry/src/base-seed.ts";
import { CATALOG } from "../registry/src/catalog.ts";
import { ERP_SEED_RECIPES } from "../registry/src/erp-seed.ts";
import { assemble, contentHash } from "../registry/src/lite.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const startersRoot = join(repoRoot, "starters");
const redPath = join(repoRoot, "scripts/fixtures/manifest-red/manifest.json");

const RECIPE_LISTS = {
  base: { recipes: BASE_SEED_RECIPES, assembleScript: "assemble-base-starter" },
  erp: { recipes: ERP_SEED_RECIPES, assembleScript: "assemble-erp-starter" },
};

function load(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`check:manifest — cannot read ${path}: ${err.message}`);
    process.exit(1);
  }
}

function formatIssues(issues) {
  return issues.map((i) => `  ${i.path || "(root)"}: ${i.message}`).join("\n");
}

const canonical = (recipes) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(recipes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, { version, files }]) => [
          name,
          {
            version,
            files: Object.fromEntries(
              Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
            ),
          },
        ])
    )
  );

const red = load(redPath);
const redResult = validateManifest(red);
if (redResult.ok) {
  console.error(
    "check:manifest — red fixture validated (interpolation in name must fail)"
  );
  process.exit(1);
}

const interpolation = redResult.issues.some(
  (i) => i.path === "name" && i.message.includes("interpolation")
);
if (!interpolation) {
  console.error(
    `check:manifest — red fixture failed, but not on name interpolation:\n${formatIssues(redResult.issues)}`
  );
  process.exit(1);
}
console.log("manifest ok: red fixture rejects name interpolation");

const starterIds = readdirSync(startersRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = false;

for (const id of starterIds) {
  const recipeSpec = RECIPE_LISTS[id];
  if (!recipeSpec) {
    console.error(
      `check:manifest — starters/${id} has no recipe list in check-manifest.mjs`
    );
    failed = true;
    continue;
  }

  const starterPath = join(startersRoot, id, "manifest.json");
  const starterAppRoot = join(startersRoot, id, "app");
  const starter = load(starterPath);
  const starterResult = validateManifest(starter);
  if (!starterResult.ok) {
    console.error(
      `check:manifest — starters/${id}/manifest.json failed v0 schema:\n${formatIssues(starterResult.issues)}`
    );
    failed = true;
    continue;
  }
  console.log(
    `manifest ok: starters/${id} format ${starterResult.manifest.format} ${starterResult.manifest.runtime}`
  );

  const assembled = assemble(CATALOG, recipeSpec.recipes);
  if (!assembled.ok) {
    console.error(
      `check:manifest — starters/${id} assemble ${assembled.name} failed: ${assembled.error}`
    );
    failed = true;
    continue;
  }
  const assembledResult = validateManifest({
    ...starter,
    recipes: assembled.provenance,
  });
  if (!assembledResult.ok) {
    console.error(
      `check:manifest — starters/${id} + seed recipes provenance failed v0:\n${formatIssues(assembledResult.issues)}`
    );
    failed = true;
    continue;
  }

  const drift = [];
  if (canonical(starter.recipes ?? {}) !== canonical(assembled.provenance)) {
    drift.push(
      `manifest.recipes differs from assemble — run \`pnpm --filter @sfab-lite/registry ${recipeSpec.assembleScript}\``
    );
  }
  for (const [path, content] of Object.entries(assembled.writes)) {
    let onDisk;
    try {
      onDisk = readFileSync(join(starterAppRoot, path), "utf8");
    } catch {
      drift.push(`${path}: missing from starters/${id}/app`);
      continue;
    }
    if (contentHash(onDisk) !== contentHash(content)) {
      drift.push(`${path}: differs from catalog recipe`);
    }
  }
  if (drift.length > 0) {
    console.error(
      `check:manifest — starters/${id} drifted from the registry:\n  ${drift.join("\n  ")}`
    );
    failed = true;
    continue;
  }
  console.log(
    `manifest ok: starters/${id} ${Object.keys(assembled.provenance).length} seed recipes match`
  );
}

if (failed) {
  process.exit(1);
}
