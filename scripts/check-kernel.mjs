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
 *
 * `kernel.json` (and its `vendor/manifest.json` duplicate, and the
 * `TYPES_VFS_MANIFEST` tail of `src/generated/types-vfs.js`) embed gzip
 * byte counts from `gzipSync()`. gzip is not a content-addressed format —
 * different zlib builds can compress the same bytes to a different-size
 * (and different-hash) stream — so those fields are scrubbed to a fixed
 * placeholder before anything is hashed or compared here. They stay in the
 * committed artifacts (apps/check reads one at runtime for its health
 * endpoint) and are printed below on every run; they just never gate this
 * check. rawBytes and every hash in these files are plain byte lengths /
 * sha256 of deterministic build output, so they assert as before.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const kernelJsonPath = "packages/kernel/kernel.json";

const trackedRoots = [
  "packages/kernel/vendor",
  kernelJsonPath,
  "packages/kernel/src/generated",
];

const GZIP_SCALAR_FIELDS = [
  "gzipBytes",
  "vfsJsonGzipBytes",
  "gzip",
  "typesGzip",
  "cssGzip",
  "clientGzip",
  "hostBakeGzip",
];
const GZIP_OBJECT_FIELDS = ["sizesGzip", "clientSizesGzip"];

/** @param {string} text */
function redactGzipFields(text) {
  let out = text;
  for (const name of GZIP_SCALAR_FIELDS) {
    out = out.replaceAll(new RegExp(`"${name}":\\s*\\d+`, "g"), `"${name}":0`);
  }
  for (const name of GZIP_OBJECT_FIELDS) {
    out = out.replaceAll(
      new RegExp(`"${name}":\\s*\\{[^{}]*\\}`, "g"),
      `"${name}":{}`
    );
  }
  return out.replaceAll(
    /"underGzipKill":\s*(?:true|false)/g,
    '"underGzipKill":false'
  );
}

/** @param {Buffer} buf */
function contentHash(buf) {
  const redacted = redactGzipFields(buf.toString("utf8"));
  return createHash("sha256")
    .update(Buffer.from(redacted, "utf8"))
    .digest("hex");
}

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

/** Worktree snapshot after rebuild: rel path → content hash (gzip fields redacted). */
function worktreeSnapshot() {
  /** @type {string[]} */
  const files = [];
  for (const root of trackedRoots) {
    walkFiles(join(repoRoot, root), files);
  }
  const map = new Map();
  for (const abs of files.sort()) {
    const rel = abs.slice(repoRoot.length + 1);
    map.set(rel, contentHash(readFileSync(abs)));
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
 * Content hash (gzip fields redacted) of the blob staged at path, or null if
 * absent from the index.
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
  return contentHash(result.stdout);
}

/** Raw (uncompressed) size fields in kernel.json: deterministic, so exact equality. */
const RAW_BYTE_PATHS = [
  ["totals", "raw"],
  ["typesVfs", "rawBytes"],
  ["cssVfs", "rawBytes"],
];

/** @param {unknown} obj @param {string[]} path */
function getPath(obj, path) {
  return path.reduce(
    (o, k) => (o && typeof o === "object" ? o[k] : undefined),
    obj
  );
}

/** kernel.json rawBytes fields, rebuilt vs indexed. Empty if kernel.json is not yet indexed. */
function rawByteDrift() {
  const indexed = spawnSync("git", ["show", `:${kernelJsonPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (indexed.status !== 0) {
    return [];
  }
  const rebuilt = JSON.parse(
    readFileSync(join(repoRoot, kernelJsonPath), "utf8")
  );
  const before = JSON.parse(indexed.stdout);
  const messages = [];
  for (const path of RAW_BYTE_PATHS) {
    const a = getPath(rebuilt, path);
    const b = getPath(before, path);
    if (a !== b) {
      const delta = a - b;
      messages.push(
        `kernel.json ${path.join(".")}: indexed=${b} rebuilt=${a} (${delta >= 0 ? "+" : ""}${delta} bytes)`
      );
    }
  }
  return messages;
}

/** gzip sizes are reporting-only — never asserted, always printed. */
function printGzipReport() {
  const kernelJson = JSON.parse(
    readFileSync(join(repoRoot, kernelJsonPath), "utf8")
  );
  console.log(
    "check:kernel — gzip sizes (reporting only, not part of this gate):"
  );
  console.log(`  server + client total: ${kernelJson.totals.gzip} bytes`);
  console.log(
    `  types VFS:             ${kernelJson.typesVfs.gzipBytes} bytes`
  );
  console.log(`  css VFS:               ${kernelJson.cssVfs.gzipBytes} bytes`);
  console.log(
    `  host-bake total:       ${kernelJson.totals.hostBakeGzip} bytes`
  );
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
printGzipReport();

/** @type {string[]} */
const drifted = [...rawByteDrift()];

const after = worktreeSnapshot();

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
  console.error(
    "\nkernel artifacts drifted after rebuild (vs git index; gzip byte counts excluded — see report above):\n"
  );
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

console.log(
  "\ncheck:kernel — ok (artifacts match git index after rebuild; rawBytes + content hash)"
);
