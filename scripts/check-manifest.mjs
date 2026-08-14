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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const starterPath = join(repoRoot, "starters/erp/manifest.json");
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
