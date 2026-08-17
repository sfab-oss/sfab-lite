#!/usr/bin/env node
/**
 * Upload the current kernel's client chunks to the factory KERNEL_R2 bucket.
 *
 * Key layout (immutable per version):
 *   kernels/<version>/client/<file>.js
 *   kernels/<version>/manifest.json   ← written last; presence = "known"
 *
 * Idempotent: if the version manifest already exists, exits 0 without
 * rewriting. Use `--force` to replace. Default target is local Miniflare R2
 * (`--local`); pass `--remote` only from a deploy job that should touch the
 * real bucket.
 *
 * Discover chunks from framework/runtime/kernel.json + vendor/client/.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCli } from "./parse-cli.mjs";

const factoryRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(factoryRoot, "../..");
const bucket = "sfab-lite-kernel";
const kernelJsonPath = join(repoRoot, "framework/runtime/kernel.json");
const clientDir = join(repoRoot, "framework/runtime/vendor/client");

const { values } = parseCli({
  force: { type: "boolean", default: false },
  remote: { type: "boolean", default: false },
  local: { type: "boolean", default: false },
});
const force = values.force;
const remote = values.remote;
if (remote && values.local) {
  console.error("pass only one of --local / --remote");
  process.exit(2);
}
const scope = remote ? "--remote" : "--local";

/** @type {{ version: string, clientChunks: string[] }} */
const kernel = JSON.parse(readFileSync(kernelJsonPath, "utf8"));
const version = kernel.version;
if (typeof version !== "string" || !version) {
  console.error("kernel.json missing version");
  process.exit(1);
}
const chunks = kernel.clientChunks;
if (!Array.isArray(chunks) || chunks.length === 0) {
  console.error("kernel.json missing clientChunks");
  process.exit(1);
}

const onDisk = new Set(readdirSync(clientDir).filter((f) => f.endsWith(".js")));
for (const file of chunks) {
  if (!onDisk.has(file)) {
    console.error(`missing chunk on disk: ${file}`);
    process.exit(1);
  }
}

function wrangler(argv) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", ...argv, "-c", "wrangler.jsonc"],
    {
      cwd: factoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  return result;
}

function objectExists(key) {
  const out = join(tmpProbe, "probe");
  const result = wrangler([
    "r2",
    "object",
    "get",
    `${bucket}/${key}`,
    "--file",
    out,
    scope,
  ]);
  return result.status === 0;
}

const tmpProbe = mkdtempSync(join(tmpdir(), "sfab-kernel-r2-probe-"));
const manifestKey = `kernels/${version}/manifest.json`;

if (!force && objectExists(manifestKey)) {
  console.log(
    `kernel ${version} already in ${bucket} (${scope.slice(2)}); skip`
  );
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "sfab-kernel-r2-"));
const manifestPath = join(tmp, "manifest.json");
const manifest = {
  version,
  chunks,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const file of chunks) {
  const key = `kernels/${version}/client/${file}`;
  const filePath = join(clientDir, file);
  console.log(`put ${key}`);
  const result = wrangler([
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    filePath,
    "--content-type",
    "application/javascript; charset=utf-8",
    "--cache-control",
    "public, max-age=31536000, immutable",
    scope,
  ]);
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

console.log(`put ${manifestKey}`);
const manifestPut = wrangler([
  "r2",
  "object",
  "put",
  `${bucket}/${manifestKey}`,
  "--file",
  manifestPath,
  "--content-type",
  "application/json; charset=utf-8",
  scope,
]);
if (manifestPut.status !== 0) {
  console.error(manifestPut.stderr || manifestPut.stdout);
  process.exit(manifestPut.status ?? 1);
}

console.log(
  `uploaded kernel ${version} (${chunks.length} chunks) → ${bucket} (${scope.slice(2)})`
);
