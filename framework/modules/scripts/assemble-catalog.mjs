#!/usr/bin/env node
/**
 * Write catalog-modules.json as the union of committed pin artifacts.
 * Pin builders must not overwrite this file (a one-element write would
 * wipe every other pin).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PINS, pinSpec } from "./pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultArtifacts = join(repoRoot, "framework/modules");
const defaultCatalog = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-modules.json"
);

const artifactsFlag = process.argv.find((arg) =>
  arg.startsWith("--artifacts-root=")
);
const catalogFlag = process.argv.find((arg) =>
  arg.startsWith("--catalog-json=")
);
const artifactsRoot = artifactsFlag
  ? artifactsFlag.slice("--artifacts-root=".length)
  : defaultArtifacts;
const catalogOut = catalogFlag
  ? catalogFlag.slice("--catalog-json=".length)
  : defaultCatalog;

function loadEntry(dir, pin) {
  const manifestPath = join(dir, "manifest.json");
  const stubFile = join(dir, "surface.d.ts");
  if (!(existsSync(manifestPath) && existsSync(stubFile))) {
    throw new Error(
      `assemble-catalog — missing artifact files under ${dir} for ${pinSpec(pin)}`
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const stub = readFileSync(stubFile, "utf8");
  return {
    name: manifest.name,
    version: manifest.version,
    plane: manifest.plane,
    runtime: manifest.runtime,
    loaderKey: manifest.loaderKey,
    esmFile: manifest.esmFile,
    stubPath: manifest.stubPath,
    rawBytes: manifest.rawBytes,
    gzipBytes: manifest.gzipBytes,
    stubBytes: manifest.stubBytes,
    sha256: manifest.sha256,
    stubSha256: manifest.stubSha256,
    esbuild: manifest.esbuild,
    evidence: manifest.evidence,
    reexportDefault: manifest.reexportDefault === true,
    boundary: pin.boundary,
    stub,
  };
}

function pinDirs() {
  if (!existsSync(artifactsRoot)) {
    return [];
  }
  return readdirSync(artifactsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

const present = new Set(pinDirs());
const missing = CATALOG_PINS.filter((pin) => !present.has(pinSpec(pin))).map(
  pinSpec
);
if (missing.length > 0) {
  console.error(
    `assemble-catalog — missing pin directories: ${missing.join(", ")}`
  );
  process.exit(1);
}

const modules = CATALOG_PINS.map((pin) =>
  loadEntry(join(artifactsRoot, pinSpec(pin)), pin)
).sort((a, b) => a.name.localeCompare(b.name));

const catalog = {
  runtimeLine: "^0",
  modules,
};
mkdirSync(dirname(catalogOut), { recursive: true });
writeFileSync(catalogOut, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`assemble-catalog — ${modules.length} pins → ${catalogOut}`);
