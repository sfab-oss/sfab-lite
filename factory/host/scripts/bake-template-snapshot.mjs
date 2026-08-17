/**
 * Write the template's drizzle-kit `migrations/meta/` (version-6 snapshot +
 * `_journal.json`).
 *
 * A seeded app has migrations from its first moment, so it needs the snapshot
 * that describes what they produced — without one, the first `db:generate`
 * would read the workspace as empty and propose creating the whole schema
 * again. Run with `--check` to verify rather than write.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  EMPTY_JOURNAL,
  isKitSnapshot,
  ORIGIN_SNAPSHOT_ID,
} from "@sfab-lite/verbs/db";
import { generateSQLiteDrizzleJson } from "drizzle-kit/api";

const factoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(factoryRoot, "../../starters/erp/app");
const metaDir = join(appRoot, "migrations/meta");
const snapshotPath = join(metaDir, "0002_snapshot.json");
const journalFile = join(metaDir, "_journal.json");

const STABLE_ID = "00000000-0000-4000-8000-000000000002";
const STABLE_WHEN = 1_752_000_000_000;

const schema = await import(join(appRoot, "src/db/schema.ts"));

function coreOf(snapshot) {
  const { id: _id, prevId: _prevId, ...rest } = snapshot;
  return rest;
}

const generated = {
  ...(await generateSQLiteDrizzleJson(schema, ORIGIN_SNAPSHOT_ID)),
  id: STABLE_ID,
  prevId: ORIGIN_SNAPSHOT_ID,
};
if (!isKitSnapshot(generated)) {
  console.error(
    "bake-template-snapshot: kit did not return a version-6 sqlite snapshot"
  );
  process.exit(1);
}

const journal = {
  ...EMPTY_JOURNAL,
  entries: [
    {
      idx: 1,
      version: "6",
      when: STABLE_WHEN,
      tag: "0001_auth",
      breakpoints: true,
    },
    {
      idx: 2,
      version: "6",
      when: STABLE_WHEN + 1,
      tag: "0002_erp",
      breakpoints: true,
    },
  ],
};

const bakedSnapshot = `${JSON.stringify(generated, null, 2)}\n`;
const bakedJournal = `${JSON.stringify(journal, null, 2)}\n`;

const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
  },
});

if (values.check) {
  let currentSnapshot = null;
  let currentJournal = null;
  try {
    currentSnapshot = readFileSync(snapshotPath, "utf8");
    currentJournal = readFileSync(journalFile, "utf8");
  } catch {
    currentSnapshot = null;
    currentJournal = null;
  }
  const parsed = currentSnapshot == null ? null : JSON.parse(currentSnapshot);
  const coreMatch =
    parsed != null &&
    JSON.stringify(coreOf(parsed)) === JSON.stringify(coreOf(generated));
  if (!coreMatch || currentJournal !== bakedJournal) {
    console.error(
      "check:template-snapshot — migrations/meta does not match the template schema. Run: pnpm --filter @sfab-lite/factory bake-template-snapshot"
    );
    process.exit(1);
  }
  console.log(
    "check:template-snapshot — kit snapshot and journal match the template schema."
  );
} else {
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(snapshotPath, bakedSnapshot);
  writeFileSync(journalFile, bakedJournal);
  console.log(
    `bake-template-snapshot: wrote ${snapshotPath} and ${journalFile}`
  );
}
