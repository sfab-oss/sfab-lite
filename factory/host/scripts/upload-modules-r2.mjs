#!/usr/bin/env node
/**
 * Upload catalog-module artifacts to the factory KERNEL_R2 bucket.
 *
 * Key layout (immutable per name@version):
 *   modules/<name>@<version>/<esmFile>
 *   modules/<name>@<version>/manifest.json   ← written last; presence = "known"
 *
 * Idempotent: if the version manifest already exists, exits 0 without
 * rewriting. Use `--force` to replace. Default target is local Miniflare R2
 * (`--local`); pass `--remote` only from a deploy job.
 *
 * Git is the source of truth; this copies committed artifacts. Do not import
 * the ESM into the host Worker bundle.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCli } from "./parse-cli.mjs";

const factoryRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = join(factoryRoot, "../..");
const bucket = "sfab-lite-kernel";
const catalogPath = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-modules.json"
);

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

/** @type {{ modules: Array<{ name: string, version: string, esmFile: string, loaderKey: string, sha256: string, rawBytes: number, gzipBytes: number }> }} */
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const modules = catalog.modules;
if (!Array.isArray(modules) || modules.length === 0) {
  console.error("catalog-modules.json missing modules");
  process.exit(1);
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

const tmpProbe = mkdtempSync(join(tmpdir(), "sfab-modules-r2-probe-"));

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

const tmp = mkdtempSync(join(tmpdir(), "sfab-modules-r2-"));

for (const entry of modules) {
  const prefix = `modules/${entry.name}@${entry.version}`;
  const manifestKey = `${prefix}/manifest.json`;
  if (!force && objectExists(manifestKey)) {
    console.log(
      `${entry.name}@${entry.version} already in ${bucket} (${scope.slice(2)}); skip`
    );
    continue;
  }

  const esmPath = join(
    repoRoot,
    "framework/modules",
    `${entry.name}@${entry.version}`,
    entry.esmFile
  );
  const esmKey = `${prefix}/${entry.esmFile}`;
  console.log(`put ${esmKey}`);
  const esmPut = wrangler([
    "r2",
    "object",
    "put",
    `${bucket}/${esmKey}`,
    "--file",
    esmPath,
    "--content-type",
    "application/javascript; charset=utf-8",
    "--cache-control",
    "public, max-age=31536000, immutable",
    scope,
  ]);
  if (esmPut.status !== 0) {
    console.error(esmPut.stderr || esmPut.stdout);
    process.exit(esmPut.status ?? 1);
  }

  const manifestPath = join(tmp, `${entry.name}@${entry.version}.json`);
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        name: entry.name,
        version: entry.version,
        loaderKey: entry.loaderKey,
        esmFile: entry.esmFile,
        sha256: entry.sha256,
        rawBytes: entry.rawBytes,
        gzipBytes: entry.gzipBytes,
      },
      null,
      2
    )}\n`
  );
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
    `uploaded ${entry.name}@${entry.version} → ${bucket} (${scope.slice(2)})`
  );
}
