#!/usr/bin/env node
/**
 * Fail if factory/host/generated/drizzle-kit-modules.json has drifted from
 * prepare-drizzle-kit-api.mjs for the pinned drizzle-kit / drizzle-orm.
 *
 * Same mold as check:seed — regenerate and compare. The map is a committed
 * build artifact: the host Worker imports it at build time so the schema
 * probe Loader child gets source strings without a KERNEL_R2 fetch.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const hostRoot = join(repoRoot, "factory/host");
const prepareScript = join(hostRoot, "scripts/prepare-drizzle-kit-api.mjs");
const committedPath = join(hostRoot, "generated/drizzle-kit-modules.json");

const tmp = mkdtempSync(join(tmpdir(), "sfab-drizzle-kit-check-"));
const outPath = join(tmp, "modules.json");

try {
  const prepared = spawnSync(
    process.execPath,
    [prepareScript, `--out=${outPath}`, "--force"],
    {
      cwd: hostRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (prepared.status !== 0) {
    process.stderr.write(prepared.stderr ?? "");
    process.stdout.write(prepared.stdout ?? "");
    console.error(
      "check:drizzle-kit-modules — prepare-drizzle-kit-api.mjs failed."
    );
    process.exit(1);
  }
  if (prepared.stdout) {
    process.stdout.write(prepared.stdout);
  }

  let committed;
  try {
    committed = readFileSync(committedPath, "utf8");
  } catch {
    console.error(
      "check:drizzle-kit-modules — factory/host/generated/drizzle-kit-modules.json is missing."
    );
    console.error(
      "  Fix: pnpm --filter @sfab-lite/factory prepare-drizzle-kit-api"
    );
    process.exit(1);
  }

  const fresh = readFileSync(outPath, "utf8");
  if (committed === fresh) {
    console.log(
      "check:drizzle-kit-modules — factory/host/generated/drizzle-kit-modules.json matches."
    );
    process.exit(0);
  }

  console.error(
    "check:drizzle-kit-modules — factory/host/generated/drizzle-kit-modules.json is stale."
  );
  console.error(
    "  Fix: pnpm --filter @sfab-lite/factory prepare-drizzle-kit-api -- --force"
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
