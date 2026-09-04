#!/usr/bin/env node
/**
 * Fail if a catalog pin is also kernel-served, if a catalog pin has no
 * recipe on-ramp, or if ≥2 starters seed a catalog-enabling recipe.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATALOG_PINS } from "../framework/modules/scripts/pins.mjs";
import {
  evaluatePlacement,
  parsePinName,
  servedPackageRoots,
} from "./check-pin-placement-lib.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const { CLIENT_IMPORT_MAP } = await import(
  pathToFileURL(
    join(repoRoot, "framework/runtime/src/generated/client-kernel.js")
  ).href
);
const { SERVER_IMPORT_MAP } = await import(
  pathToFileURL(
    join(repoRoot, "framework/runtime/src/generated/runtime-exports.js")
  ).href
);

const catalog = JSON.parse(
  readFileSync(join(repoRoot, "registry/src/generated/catalog.json"), "utf8")
);

const catalogEnablingRecipes = Object.entries(catalog.items)
  .flatMap(([name, entry]) => {
    const deps = entry?.item?.dependencies ?? [];
    if (deps.length === 0) {
      return [];
    }
    return [
      {
        name,
        pinNames: deps.map(parsePinName).filter((pin) => pin != null),
      },
    ];
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const starters = readdirSync(join(repoRoot, "starters"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const manifest = JSON.parse(
      readFileSync(
        join(repoRoot, "starters", entry.name, "manifest.json"),
        "utf8"
      )
    );
    return {
      starter: entry.name,
      recipes: Object.keys(manifest.recipes ?? {}),
    };
  });

const errors = evaluatePlacement({
  catalogPins: CATALOG_PINS,
  kernelPackageRoots: servedPackageRoots(CLIENT_IMPORT_MAP, SERVER_IMPORT_MAP),
  catalogEnablingRecipes,
  starters,
});

if (errors.length > 0) {
  console.error("check:pin-placement — live tree is red:");
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}

const pins = CATALOG_PINS.map((pin) => `${pin.name}@${pin.version}`).join(", ");
console.log(
  `check:pin-placement — ${pins} stay catalog; starters seed no catalog-enabling recipes.`
);
