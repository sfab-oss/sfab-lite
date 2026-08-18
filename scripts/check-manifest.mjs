#!/usr/bin/env node
/**
 * Manifest v0 schema gate.
 *
 * The starter must validate. A committed invalid fixture must not —
 * that is the making-it-fit red-test: if the validator went missing or
 * started accepting interpolation, this gate fails closed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifest } from "../framework/toolchain/src/validate-manifest.ts";
import { CATALOG } from "../registry/src/catalog.ts";
import { ERP_SEED_RECIPES } from "../registry/src/erp-seed.ts";
import { assemble, contentHash } from "../registry/src/lite.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const starterPath = join(repoRoot, "starters/erp/manifest.json");
const starterAppRoot = join(repoRoot, "starters/erp/app");
const redPath = join(repoRoot, "scripts/fixtures/manifest-red/manifest.json");

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

const starter = load(starterPath);
const starterResult = validateManifest(starter);
if (!starterResult.ok) {
  console.error(
    `check:manifest — starters/erp/manifest.json failed v0 schema:\n${formatIssues(starterResult.issues)}`
  );
  process.exit(1);
}

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

console.log(
  `manifest ok: starters/erp format ${starterResult.manifest.format} ${starterResult.manifest.runtime} + red fixture`
);

const assembled = assemble(CATALOG, ERP_SEED_RECIPES);
if (!assembled.ok) {
  console.error(
    `check:manifest — add ${assembled.name} failed: ${assembled.error}`
  );
  process.exit(1);
}
const assembledResult = validateManifest({
  ...starter,
  recipes: assembled.provenance,
});
if (!assembledResult.ok) {
  console.error(
    `check:manifest — starter + ERP_SEED_RECIPES provenance failed v0:\n${formatIssues(assembledResult.issues)}`
  );
  process.exit(1);
}

// The starter is the ERP seed list, assembled. Committed provenance must be
// exactly that assembly, and every recipe file on disk must still hash to it —
// otherwise `manifest.recipes` describes a tree that no longer exists.
const drift = [];
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
if (canonical(starter.recipes ?? {}) !== canonical(assembled.provenance)) {
  drift.push(
    "manifest.recipes differs from assemble(CATALOG, ERP_SEED_RECIPES) — run `pnpm --filter @sfab-lite/registry assemble-erp-starter`"
  );
}
for (const [path, content] of Object.entries(assembled.writes)) {
  let onDisk;
  try {
    onDisk = readFileSync(join(starterAppRoot, path), "utf8");
  } catch {
    drift.push(`${path}: missing from starters/erp/app`);
    continue;
  }
  if (contentHash(onDisk) !== contentHash(content)) {
    drift.push(`${path}: differs from catalog recipe`);
  }
}
if (drift.length > 0) {
  console.error(
    `check:manifest — starter drifted from the registry:\n  ${drift.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  `manifest ok: ${Object.keys(assembled.provenance).length} seed recipes via add; starter tree + provenance match ERP_SEED_RECIPES`
);
