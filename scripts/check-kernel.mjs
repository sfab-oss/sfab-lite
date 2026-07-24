#!/usr/bin/env node
/**
 * Kernel artifact drift gate: rebuild from the isolated universe and fail if
 * any committed vendor / generated / kernel.json byte changes relative to the
 * tree as it stood before the rebuild.
 *
 * Compares content hashes before vs after rebuild (not vs git HEAD), so the
 * first commit that lands new artifacts can still pass pre-commit: regenerate,
 * then the gate rebuilds again and must match.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const roots = [
  join(repoRoot, "packages/kernel/vendor"),
  join(repoRoot, "packages/kernel/kernel.json"),
  join(repoRoot, "packages/kernel/src/generated"),
];

/** @param {string} dir @param {string[]} out */
function walkFiles(dir, out) {
  if (!existsSync(dir)) {
    return;
  }
  if (statSync(dir).isFile()) {
    out.push(dir);
    return;
  }
  for (const name of readdirSync(dir).sort()) {
    walkFiles(join(dir, name), out);
  }
}

/** @returns {Map<string, string>} */
function snapshot() {
  /** @type {string[]} */
  const files = [];
  for (const root of roots) {
    walkFiles(root, files);
  }
  const map = new Map();
  for (const abs of files.sort()) {
    const rel = abs.slice(repoRoot.length + 1);
    map.set(
      rel,
      createHash("sha256").update(readFileSync(abs)).digest("hex")
    );
  }
  return map;
}

function runBuild() {
  const result = spawnSync(
    "pnpm",
    ["--filter", "@sfab-lite/kernel", "build"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "inherit",
    }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  "check:kernel — rebuilding @sfab-lite/kernel from isolated universe…"
);
const before = snapshot();
runBuild();
const after = snapshot();

/** @type {string[]} */
const drifted = [];
for (const [file, hash] of after) {
  if (before.get(file) !== hash) {
    drifted.push(file);
  }
}
for (const file of before.keys()) {
  if (!after.has(file)) {
    drifted.push(`${file} (removed)`);
  }
}

if (drifted.length) {
  console.error("kernel artifacts drifted after rebuild:\n");
  for (const f of drifted.sort()) {
    console.error(`  ${f}`);
  }
  console.error(
    "\nRe-run `pnpm --filter @sfab-lite/kernel build` and commit the artifacts,"
  );
  console.error(
    "or fix the universe pins/lockfile if the change is unintended."
  );
  process.exit(1);
}

console.log("check:kernel — ok (artifacts match isolated rebuild)");
