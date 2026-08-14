#!/usr/bin/env node
/**
 * Red test: a starter package.json version edit must not change the
 * runtime's pinned universe. Pins live in framework/runtime/scripts/pins.mjs.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PINS } from "../framework/runtime/scripts/pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pinsPath = join(repoRoot, "framework/runtime/scripts/pins.mjs");
const starterPkgPath = join(repoRoot, "starters/erp/package.json");

const pinsSrc = readFileSync(pinsPath, "utf8");
if (
  /starters\/erp/.test(pinsSrc) ||
  /packages\/template/.test(pinsSrc) ||
  /readFileSync/.test(pinsSrc)
) {
  console.error(
    "check:pins — pins.mjs must not read the starter package.json (runtime owns the pins)"
  );
  process.exit(1);
}

const original = readFileSync(starterPkgPath, "utf8");
const mutated = JSON.parse(original);
mutated.dependencies = { ...mutated.dependencies, react: "0.0.0-MUTATED" };
writeFileSync(starterPkgPath, `${JSON.stringify(mutated, null, 2)}\n`);

try {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { PINS } from ${JSON.stringify(pathToFileURL(pinsPath).href)};
       console.log(PINS.react);`,
    ],
    { encoding: "utf8", cwd: repoRoot }
  );
  if (child.status !== 0) {
    console.error(`check:pins — child failed\n${child.stderr}${child.stdout}`);
    process.exit(1);
  }
  const got = child.stdout.trim();
  if (got === "0.0.0-MUTATED") {
    console.error(
      "check:pins — starter package.json edit changed runtime pin for react"
    );
    process.exit(1);
  }
  if (got !== PINS.react) {
    console.error(
      `check:pins — expected runtime react ${PINS.react}, got ${got}`
    );
    process.exit(1);
  }
} finally {
  writeFileSync(starterPkgPath, original);
}

console.log(
  `pins independence ok: starter react mutation did not change runtime pin ${PINS.react}`
);
