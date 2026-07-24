#!/usr/bin/env node
/**
 * Kernel artifact drift gate: rebuild from the isolated universe and fail if
 * the rebuild output does not match the git index for vendor / generated /
 * kernel.json.
 *
 * Compares against the index (`git show :<path>`), not the pre-rebuild
 * worktree — so a rebuild that overwrites a stale worktree cannot erase its
 * own failure. Workflow: regenerate, `git add` the artifacts, then the gate
 * rebuilds and must match the staged blobs.
 *
 * Files present after rebuild but absent from the index are an explicit
 * failure (newly added artifacts must be staged), not a silent match.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const trackedRoots = [
  "packages/kernel/vendor",
  "packages/kernel/kernel.json",
  "packages/kernel/src/generated",
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

/** Worktree snapshot after rebuild: rel path → sha256 hex. */
function worktreeSnapshot() {
  /** @type {string[]} */
  const files = [];
  for (const root of trackedRoots) {
    walkFiles(join(repoRoot, root), files);
  }
  const map = new Map();
  for (const abs of files.sort()) {
    const rel = abs.slice(repoRoot.length + 1);
    map.set(rel, createHash("sha256").update(readFileSync(abs)).digest("hex"));
  }
  return map;
}

/** Paths currently in the git index under the tracked roots. */
function indexPaths() {
  const result = spawnSync("git", ["ls-files", "-c", "--", ...trackedRoots], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr || "git ls-files failed");
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * sha256 of the blob staged at path, or null if absent from the index.
 * @param {string} rel
 */
function indexHash(rel) {
  const result = spawnSync("git", ["show", `:${rel}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return null;
  }
  return createHash("sha256").update(result.stdout).digest("hex");
}

function runBuild() {
  const result = spawnSync("pnpm", ["--filter", "@sfab-lite/kernel", "build"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(
  "check:kernel — rebuilding @sfab-lite/kernel from isolated universe…"
);
runBuild();
const after = worktreeSnapshot();

/** @type {string[]} */
const drifted = [];

for (const [file, hash] of after) {
  const indexed = indexHash(file);
  if (indexed === null) {
    drifted.push(`${file} (not in git index — git add it)`);
  } else if (indexed !== hash) {
    drifted.push(file);
  }
}

for (const file of indexPaths()) {
  if (!after.has(file)) {
    drifted.push(`${file} (removed by rebuild; still in git index)`);
  }
}

if (drifted.length) {
  console.error("kernel artifacts drifted after rebuild (vs git index):\n");
  for (const f of [...new Set(drifted)].sort()) {
    console.error(`  ${f}`);
  }
  console.error(
    "\n`git add` the regenerated files under packages/kernel/vendor,"
  );
  console.error(
    "packages/kernel/kernel.json, and packages/kernel/src/generated,"
  );
  console.error(
    "or fix the universe pins/lockfile if the change is unintended."
  );
  process.exit(1);
}

console.log("check:kernel — ok (artifacts match git index after rebuild)");
