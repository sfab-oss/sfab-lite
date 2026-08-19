#!/usr/bin/env node
/**
 * Fail if the committed pdf-lib catalog artifact has drifted from a fresh
 * isolated build (same mold as check:drizzle-kit-modules / check:seed).
 *
 * Git is the source of truth. The host Worker must not import the ESM.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildScript = join(
  repoRoot,
  "framework/modules/scripts/build-pdf-lib.mjs"
);
const pin = "pdf-lib@1.17.1";
const committedDir = join(repoRoot, "framework/modules", pin);
const committedCatalog = join(
  repoRoot,
  "framework/toolchain/src/generated/catalog-modules.json"
);
const compared = [
  ["pdf-lib.esm.js", join(committedDir, "pdf-lib.esm.js")],
  ["index.d.ts", join(committedDir, "index.d.ts")],
  ["manifest.json", join(committedDir, "manifest.json")],
  ["catalog-modules.json", committedCatalog],
];

function rebuild(outDir, catalogJson) {
  const built = spawnSync(
    process.execPath,
    [buildScript, `--out-dir=${outDir}`, `--catalog-json=${catalogJson}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (built.status !== 0) {
    process.stderr.write(built.stderr ?? "");
    process.stdout.write(built.stdout ?? "");
    console.error("check:modules — build-pdf-lib.mjs failed.");
    process.exit(1);
  }
  if (built.stdout) {
    process.stdout.write(built.stdout);
  }
}

function driftAgainst(outDir, catalogJson) {
  const fresh = {
    "pdf-lib.esm.js": readFileSync(join(outDir, "pdf-lib.esm.js")),
    "index.d.ts": readFileSync(join(outDir, "index.d.ts")),
    "manifest.json": readFileSync(join(outDir, "manifest.json")),
    "catalog-modules.json": readFileSync(catalogJson),
  };
  const drifted = [];
  for (const [label, path] of compared) {
    let committed;
    try {
      committed = readFileSync(path);
    } catch {
      drifted.push(`${label} is missing`);
      continue;
    }
    if (!committed.equals(fresh[label])) {
      drifted.push(label);
    }
  }
  return drifted;
}

const tmp = mkdtempSync(join(tmpdir(), "sfab-check-modules-"));
const outDir = join(tmp, pin);
const catalogJson = join(tmp, "catalog-modules.json");

try {
  rebuild(outDir, catalogJson);
  const drifted = driftAgainst(outDir, catalogJson);
  if (drifted.length > 0) {
    console.error("check:modules — catalog artifacts are stale:");
    for (const name of drifted) {
      console.error(`  ${name}`);
    }
    console.error("  Fix: node framework/modules/scripts/build-pdf-lib.mjs");
    process.exit(1);
  }

  const esmPath = join(outDir, "pdf-lib.esm.js");
  writeFileSync(
    esmPath,
    Buffer.concat([readFileSync(esmPath), Buffer.from("\n")])
  );
  const red = driftAgainst(outDir, catalogJson);
  if (!red.includes("pdf-lib.esm.js")) {
    console.error(
      "check:modules — red-test did not fail after mutating the tmp pdf-lib.esm.js"
    );
    process.exit(1);
  }

  console.log(
    `check:modules — framework/modules/${pin} matches (regenerate-and-diff + red-test).`
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
