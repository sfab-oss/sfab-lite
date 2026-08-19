#!/usr/bin/env node
/**
 * Registry gates: lite profile on every published item, catalog/published
 * drift, committed red fixtures, and immutable version retention.
 *
 * Red fixtures are the making-it-fit lesson: if the validator started
 * accepting a non-catalog `dependencies` pin, unknown types, or a bare
 * registryDependencies name, this gate fails closed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateItem } from "../registry/src/lite.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bake = join(repoRoot, "registry/scripts/bake-catalog.mjs");
const redRoot = join(repoRoot, "scripts/fixtures/registry-red");
const publishedPath = join(repoRoot, "registry/published.json");

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function formatIssues(issues) {
  return issues.map((i) => `  ${i.path || "(root)"}: ${i.message}`).join("\n");
}

const baked = spawnSync(
  process.execPath,
  ["--experimental-strip-types", bake, "--check"],
  { cwd: repoRoot, encoding: "utf8" }
);
if (baked.status !== 0) {
  process.stderr.write(baked.stderr);
  process.stdout.write(baked.stdout);
  process.exit(baked.status ?? 1);
}
process.stdout.write(baked.stdout);

const reds = [
  {
    file: join(redRoot, "dependencies/registry-item.json"),
    needle: "expected an exact catalog pin name@version",
    label: "dependencies",
  },
  {
    file: join(redRoot, "dependencies-unknown/registry-item.json"),
    needle: "unknown catalog module",
    label: "dependencies-unknown",
  },
  {
    file: join(redRoot, "dependencies-wrong-pin/registry-item.json"),
    needle: 'catalog pin for "pdf-lib" must be 1.17.1',
    label: "dependencies-wrong-pin",
  },
  {
    file: join(redRoot, "unknown-type/registry-item.json"),
    needle: "unknown item type",
    label: "unknown-type",
  },
  {
    file: join(redRoot, "bare-name/registry-item.json"),
    needle: "bare names are a hard error",
    label: "bare-name",
  },
];

for (const red of reds) {
  if (!existsSync(red.file)) {
    console.error(`check:registry — missing red fixture ${red.file}`);
    process.exit(1);
  }
  const result = validateItem(load(red.file));
  if (result.ok) {
    console.error(
      `check:registry — red fixture ${red.label} validated (must fail)`
    );
    process.exit(1);
  }
  const hit = result.issues.some((i) => i.message.includes(red.needle));
  if (!hit) {
    console.error(
      `check:registry — red fixture ${red.label} failed, but not on "${red.needle}":\n${formatIssues(result.issues)}`
    );
    process.exit(1);
  }
}

const shown = spawnSync(
  "git",
  ["show", "origin/main:registry/published.json"],
  { cwd: repoRoot, encoding: "utf8" }
);
if (shown.status === 0 && shown.stdout.trim().length > 0) {
  const previous = JSON.parse(shown.stdout);
  const current = load(publishedPath);
  const mutated = [];
  for (const key of Object.keys(previous)) {
    const was = JSON.stringify(previous[key]);
    const now = JSON.stringify(current[key]);
    if (now === undefined) {
      mutated.push(`${key} was removed`);
    } else if (was !== now) {
      mutated.push(`${key} hashes changed`);
    }
  }
  if (mutated.length > 0) {
    console.error(
      `check:registry — published versions are immutable:\n  ${mutated.join("\n  ")}`
    );
    process.exit(1);
  }
}

console.log("registry ok (catalog + published + red fixtures + immutability)");
