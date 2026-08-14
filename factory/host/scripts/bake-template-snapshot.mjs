/**
 * Write the template's `migrations/meta/<latest>_snapshot.json`.
 *
 * A seeded app has migrations from its first moment, so it needs the snapshot
 * that describes what they produced — without one, the first `db:generate`
 * would read the workspace as having no tables and propose creating the whole
 * schema again. A real drizzle project commits `meta/` alongside its
 * migrations for exactly this reason; this is how ours gets there.
 *
 * Run with `--check` to verify rather than write. `check:template-snapshot`
 * does that, so a schema edit that forgets to re-bake fails a gate instead of
 * reaching a user's first migration.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeSnapshot } from "../src/schema/schema-ddl.ts";
import { probeEntrySource } from "../src/schema/schema-probe-source.ts";
import { serializeSnapshot } from "../src/schema/schema-snapshots.ts";

const factoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(factoryRoot, "../../starters/erp/app");
const migrationsDir = join(appRoot, "migrations");

/** Gitignored, so a crash cannot leave the template dirty. */
const scratch = join(appRoot, "src/__sfab_probe_check.ts");

function latestMigrationId() {
  const ids = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const newest = ids.at(-1);
  if (!newest) {
    console.error("bake-template-snapshot: no migrations in the template");
    process.exit(1);
  }
  return newest.slice(0, -".sql".length);
}

async function probe() {
  writeFileSync(scratch, probeEntrySource("src/db/schema/index.ts"));
  try {
    const mod = await import(`${scratch}?t=${Date.now()}`);
    const body = await mod.default.fetch().json();
    if (!body.ok) {
      console.error(`bake-template-snapshot: probe failed — ${body.error}`);
      process.exit(1);
    }
    return canonicalizeSnapshot({ tables: body.tables ?? [] });
  } finally {
    rmSync(scratch, { force: true });
  }
}

const target = join(
  migrationsDir,
  "meta",
  `${latestMigrationId()}_snapshot.json`
);
const baked = serializeSnapshot(await probe());

if (process.argv.includes("--check")) {
  let current = null;
  try {
    current = readFileSync(target, "utf8");
  } catch {
    current = null;
  }
  if (current !== baked) {
    console.error(
      `check:template-snapshot — ${target} does not match the template schema. Run: pnpm bake:template-snapshot`
    );
    process.exit(1);
  }
  console.log(
    "check:template-snapshot — snapshot matches the template schema."
  );
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, baked);
  console.log(`bake-template-snapshot: wrote ${target}`);
}
