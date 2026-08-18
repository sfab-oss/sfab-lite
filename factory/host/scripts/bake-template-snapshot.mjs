/**
 * Write a starter's drizzle-kit `migrations/meta/` (version-6 tip snapshot +
 * `_journal.json`).
 *
 * A seeded app has migrations from its first moment, so it needs the snapshot
 * that describes what they produced — without one, the first `db:generate`
 * would read the workspace as empty and propose creating the whole schema
 * again. Run with `--check` to verify rather than write.
 *
 * Usage:
 *   pnpm --filter @sfab-lite/factory bake-template-snapshot [--starter=base|erp]
 *   pnpm --filter @sfab-lite/factory bake-template-snapshot -- --check
 *
 * With no `--starter`, checks/bakes every starter under `starters/`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
const startersRoot = join(factoryRoot, "../../starters");

const STABLE_WHEN = 1_752_000_000_000;

/** Tip snapshot filename + journal tags per starter id. */
const STARTER_META = {
  base: {
    tipSnapshot: "0001_snapshot.json",
    tipId: "00000000-0000-4000-8000-000000000001",
    journalTags: ["0001_auth"],
  },
  erp: {
    tipSnapshot: "0002_snapshot.json",
    tipId: "00000000-0000-4000-8000-000000000002",
    journalTags: ["0001_auth", "0002_erp"],
  },
};

function coreOf(snapshot) {
  const { id: _id, prevId: _prevId, ...rest } = snapshot;
  return rest;
}

function listStarterIds() {
  return readdirSync(startersRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => STARTER_META[id] != null)
    .sort();
}

async function bakeOne(starterId, check) {
  const meta = STARTER_META[starterId];
  if (!meta) {
    console.error(
      `bake-template-snapshot: unknown starter "${starterId}" (known: ${Object.keys(STARTER_META).join(", ")})`
    );
    process.exit(1);
  }

  const appRoot = join(startersRoot, starterId, "app");
  const metaDir = join(appRoot, "migrations/meta");
  const snapshotPath = join(metaDir, meta.tipSnapshot);
  const journalFile = join(metaDir, "_journal.json");

  const schema = await import(join(appRoot, "src/db/schema.ts"));
  const generated = {
    ...(await generateSQLiteDrizzleJson(schema, ORIGIN_SNAPSHOT_ID)),
    id: meta.tipId,
    prevId: ORIGIN_SNAPSHOT_ID,
  };
  if (!isKitSnapshot(generated)) {
    console.error(
      `bake-template-snapshot (${starterId}): kit did not return a version-6 sqlite snapshot`
    );
    process.exit(1);
  }

  const journal = {
    ...EMPTY_JOURNAL,
    entries: meta.journalTags.map((tag, i) => ({
      idx: i + 1,
      version: "6",
      when: STABLE_WHEN + i,
      tag,
      breakpoints: true,
    })),
  };

  const bakedSnapshot = `${JSON.stringify(generated, null, 2)}\n`;
  const bakedJournal = `${JSON.stringify(journal, null, 2)}\n`;

  if (check) {
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
        `check:template-snapshot — starters/${starterId}/app/migrations/meta does not match schema. Run: pnpm --filter @sfab-lite/factory bake-template-snapshot -- --starter=${starterId}`
      );
      process.exit(1);
    }
    console.log(
      `check:template-snapshot — starters/${starterId} kit snapshot and journal match.`
    );
    return;
  }

  mkdirSync(metaDir, { recursive: true });
  writeFileSync(snapshotPath, bakedSnapshot);
  writeFileSync(journalFile, bakedJournal);
  console.log(
    `bake-template-snapshot (${starterId}): wrote ${snapshotPath} and ${journalFile}`
  );
}

const { values } = parseArgs({
  options: {
    check: { type: "boolean", default: false },
    starter: { type: "string" },
  },
});

const ids = values.starter ? [values.starter] : listStarterIds();
for (const id of ids) {
  await bakeOne(id, values.check);
}
