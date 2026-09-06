#!/usr/bin/env node
/**
 * Fail if committed catalog-module artifacts drifted from a fresh isolated
 * build of every pin, if the assembled catalog-modules.json drifted, or if
 * a pin is missing real-vfs.json / catalog-real-vfs.json drifted.
 *
 * Git is the source of truth. The host Worker must not import the ESM.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_PINS, pinSpec } from "../framework/modules/scripts/pins.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildModule = join(
  repoRoot,
  "framework/modules/scripts/build-module.mjs"
);
const assembleCatalog = join(
  repoRoot,
  "framework/modules/scripts/assemble-catalog.mjs"
);
const assembleRealVfs = join(
  repoRoot,
  "framework/modules/scripts/assemble-real-vfs.mjs"
);
const committedCatalog = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-modules.json"
);
const committedRealVfs = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-real-vfs.json"
);
const FIX = "Fix: node framework/modules/scripts/rebuild-catalog-modules.mjs";

function run(script, args) {
  const built = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (built.status !== 0) {
    process.stderr.write(built.stderr ?? "");
    process.stdout.write(built.stdout ?? "");
    console.error(`check:modules — ${script} failed.`);
    process.exit(1);
  }
  if (built.stdout) {
    process.stdout.write(built.stdout);
  }
}

function compareBytes(label, committedPath, freshBuf, drifted) {
  let committed;
  try {
    committed = readFileSync(committedPath);
  } catch {
    drifted.push(`${label} is missing`);
    return;
  }
  if (!committed.equals(freshBuf)) {
    drifted.push(label);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "sfab-check-modules-"));
const catalogJson = join(tmp, "catalog-modules.json");
const realVfsJson = join(tmp, "catalog-real-vfs.json");

try {
  const drifted = [];
  for (const pin of CATALOG_PINS) {
    const spec = pinSpec(pin);
    const outDir = join(tmp, spec);
    const committedDir = join(repoRoot, "framework/modules", spec);
    run(buildModule, [`--pin=${spec}`, `--out-dir=${outDir}`]);
    compareBytes(
      `${spec}/${pin.esmFile}`,
      join(committedDir, pin.esmFile),
      readFileSync(join(outDir, pin.esmFile)),
      drifted
    );
    compareBytes(
      `${spec}/surface.d.ts`,
      join(committedDir, "surface.d.ts"),
      readFileSync(join(outDir, "surface.d.ts")),
      drifted
    );
    compareBytes(
      `${spec}/manifest.json`,
      join(committedDir, "manifest.json"),
      readFileSync(join(outDir, "manifest.json")),
      drifted
    );
    if (!existsSync(join(committedDir, "real-vfs.json"))) {
      drifted.push(`${spec}/real-vfs.json is missing`);
    }
  }

  run(assembleCatalog, [
    `--artifacts-root=${tmp}`,
    `--catalog-json=${catalogJson}`,
  ]);
  compareBytes(
    "catalog-modules.json",
    committedCatalog,
    readFileSync(catalogJson),
    drifted
  );

  run(assembleRealVfs, [`--catalog-json=${realVfsJson}`]);
  compareBytes(
    "catalog-real-vfs.json",
    committedRealVfs,
    readFileSync(realVfsJson),
    drifted
  );

  if (drifted.length > 0) {
    console.error("check:modules — catalog artifacts are stale:");
    for (const name of drifted) {
      console.error(`  ${name}`);
    }
    console.error(`  ${FIX}`);
    process.exit(1);
  }

  const redPin = CATALOG_PINS[0];
  const redSpec = pinSpec(redPin);
  const redEsm = join(tmp, redSpec, redPin.esmFile);
  writeFileSync(
    redEsm,
    Buffer.concat([readFileSync(redEsm), Buffer.from("\n")])
  );
  const redDrifted = [];
  compareBytes(
    `${redSpec}/${redPin.esmFile}`,
    join(repoRoot, "framework/modules", redSpec, redPin.esmFile),
    readFileSync(redEsm),
    redDrifted
  );
  if (!redDrifted.includes(`${redSpec}/${redPin.esmFile}`)) {
    console.error(
      `check:modules — red-test did not fail after mutating the tmp ${redPin.esmFile}`
    );
    process.exit(1);
  }

  const pins = CATALOG_PINS.map(pinSpec).join(", ");
  console.log(
    `check:modules — ${pins} match (regenerate-and-diff + red-test).`
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
