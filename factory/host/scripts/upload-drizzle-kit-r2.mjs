#!/usr/bin/env node
/**
 * Upload the prepared drizzle-kit module map to the factory KERNEL_R2 bucket.
 *
 * Key layout (immutable per kit+orm pin):
 *   tools/drizzle-kit/<kitVersion>-<ormVersion>/modules.json
 *   tools/drizzle-kit/<kitVersion>-<ormVersion>/manifest.json
 *     ← written last; presence = "known"
 *
 * Idempotent: if the version manifest already exists, exits 0 without
 * rewriting. Use `--force` to replace. Default target is local Miniflare R2
 * (`--local`); pass `--remote` only from a deploy job that should touch the
 * real bucket.
 *
 * Runs prepare-drizzle-kit-api.mjs first so `.tmp/drizzle-kit/modules.json`
 * exists.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const factoryRoot = fileURLToPath(new URL("..", import.meta.url));
const bucket = "sfab-lite-kernel";
const modulesPath = join(factoryRoot, ".tmp/drizzle-kit/modules.json");
const stampPath = join(factoryRoot, ".tmp/drizzle-kit/stamp.json");
const PINNED_KIT = "0.31.10";
const PINNED_ORM = "0.45.2";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const remote = args.has("--remote");
if (remote && args.has("--local")) {
  console.error("pass only one of --local / --remote");
  process.exit(2);
}
const scope = remote ? "--remote" : "--local";

const prepare = spawnSync(
  "node",
  [join(factoryRoot, "scripts/prepare-drizzle-kit-api.mjs")],
  {
    cwd: factoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }
);
if (prepare.status !== 0) {
  console.error(prepare.stderr || prepare.stdout);
  process.exit(prepare.status ?? 1);
}
if (prepare.stdout) {
  process.stdout.write(prepare.stdout);
}

/** @type {{ drizzleKit: string, drizzleOrm: string }} */
const stamp = JSON.parse(readFileSync(stampPath, "utf8"));
if (stamp.drizzleKit !== PINNED_KIT || stamp.drizzleOrm !== PINNED_ORM) {
  console.error(
    `upload-drizzle-kit-r2: stamp ${stamp.drizzleKit}-${stamp.drizzleOrm} does not match pin ${PINNED_KIT}-${PINNED_ORM}`
  );
  process.exit(1);
}
const version = `${stamp.drizzleKit}-${stamp.drizzleOrm}`;
const prefix = `tools/drizzle-kit/${version}`;
const modulesKey = `${prefix}/modules.json`;
const manifestKey = `${prefix}/manifest.json`;

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

const tmpProbe = mkdtempSync(join(tmpdir(), "sfab-drizzle-kit-r2-probe-"));

if (!force && objectExists(manifestKey)) {
  console.log(
    `drizzle-kit ${version} already in ${bucket} (${scope.slice(2)}); skip`
  );
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "sfab-drizzle-kit-r2-"));
const manifestPath = join(tmp, "manifest.json");
writeFileSync(
  manifestPath,
  `${JSON.stringify(
    { drizzleKit: stamp.drizzleKit, drizzleOrm: stamp.drizzleOrm },
    null,
    2
  )}\n`
);

console.log(`put ${modulesKey}`);
const modulesPut = wrangler([
  "r2",
  "object",
  "put",
  `${bucket}/${modulesKey}`,
  "--file",
  modulesPath,
  "--content-type",
  "application/json; charset=utf-8",
  "--cache-control",
  "public, max-age=31536000, immutable",
  scope,
]);
if (modulesPut.status !== 0) {
  console.error(modulesPut.stderr || modulesPut.stdout);
  process.exit(modulesPut.status ?? 1);
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

console.log(`uploaded drizzle-kit ${version} → ${bucket} (${scope.slice(2)})`);
