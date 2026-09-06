#!/usr/bin/env node
/**
 * Union committed per-pin real-vfs.json into catalog-real-vfs.json.
 * The check worker overlays these only on the extra modules unit.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PINS, pinSpec } from "./pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactsRoot = join(repoRoot, "framework/modules");
const catalogFlag = process.argv.find((arg) =>
  arg.startsWith("--catalog-json=")
);
const outPath = catalogFlag
  ? catalogFlag.slice("--catalog-json=".length)
  : join(repoRoot, "framework/toolchain/src/generated/catalog-real-vfs.json");

const byName = {};
for (const pin of CATALOG_PINS) {
  const file = join(artifactsRoot, pinSpec(pin), "real-vfs.json");
  if (!existsSync(file)) {
    console.error(`assemble-real-vfs — missing ${file}`);
    process.exit(1);
  }
  byName[pin.name] = JSON.parse(readFileSync(file, "utf8"));
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(byName)}\n`);
console.log(`assemble-real-vfs — ${CATALOG_PINS.length} pins → ${outPath}`);
