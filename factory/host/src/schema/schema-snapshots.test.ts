import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import { EMPTY_SNAPSHOT } from "./schema-kit.ts";
import {
  convertLegacyMeta,
  isLegacySchemaMeta,
  journalPath,
  LEGACY_META_CD_MESSAGE,
  latestSnapshot,
  legacySchemaGateFailure,
  SCHEMA_META_LEGACY,
  serializeJournal,
  serializeSnapshot,
  snapshotPathFor,
} from "./schema-snapshots.ts";

const MANIFEST = seed.manifest as ManifestV0;

const BAD_JSON = /is not valid drizzle-kit snapshot JSON/;

function workspace(entries: Record<string, string>): Record<string, string> {
  return { "src/db/schema.ts": "// schema", ...entries };
}

function kitSnap(id: string, tables: Record<string, unknown>) {
  return serializeSnapshot({
    version: "6",
    dialect: "sqlite",
    id,
    prevId: "00000000-0000-0000-0000-000000000000",
    tables,
    views: {},
    enums: {},
    _meta: { tables: {}, columns: {} },
    internal: { indexes: {} },
  });
}

describe("snapshotPathFor", () => {
  it("names the snapshot after the migration index, kit-style", () => {
    assert.equal(
      snapshotPathFor("migrations/0003_water_delivery.sql", MANIFEST),
      "migrations/meta/0003_snapshot.json"
    );
  });
});

describe("latestSnapshot", () => {
  it("reads an app with no migrations as having no tables", () => {
    assert.deepEqual(latestSnapshot(workspace({}), MANIFEST), EMPTY_SNAPSHOT);
  });

  it("prefers the snapshot named by the journal's last entry", () => {
    const files = workspace({
      "migrations/meta/_journal.json": JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          {
            idx: 1,
            version: "6",
            when: 1,
            tag: "0001_early",
            breakpoints: true,
          },
          {
            idx: 3,
            version: "6",
            when: 2,
            tag: "0003_late",
            breakpoints: true,
          },
        ],
      }),
      "migrations/meta/0003_snapshot.json": kitSnap("late", {
        late: { name: "late" },
      }),
      "migrations/meta/0001_snapshot.json": kitSnap("early", {
        early: { name: "early" },
      }),
    });
    assert.equal(latestSnapshot(files, MANIFEST).id, "late");
  });

  it("falls back to the highest-numbered snapshot without a journal", () => {
    const files = workspace({
      "migrations/meta/0003_snapshot.json": kitSnap("late", {
        late: { name: "late" },
      }),
      "migrations/meta/0001_snapshot.json": kitSnap("early", {
        early: { name: "early" },
      }),
    });
    assert.equal(latestSnapshot(files, MANIFEST).id, "late");
  });

  it("ignores files under meta/ that are not snapshots", () => {
    const files = workspace({
      "migrations/meta/notes.md": "not a snapshot",
      "migrations/0001_auth.sql": "CREATE TABLE user (id TEXT);",
    });
    assert.deepEqual(latestSnapshot(files, MANIFEST), EMPTY_SNAPSHOT);
  });

  it("refuses a snapshot that will not parse", () => {
    const files = workspace({
      "migrations/meta/0001_snapshot.json": "{ not json",
    });
    assert.throws(() => latestSnapshot(files, MANIFEST), BAD_JSON);
  });
});

describe("the template ships kit meta", () => {
  it("seeds a version-6 snapshot describing the seed schema", () => {
    const snapshot = latestSnapshot(seed.sourceFiles, MANIFEST);
    assert.notDeepEqual(snapshot, EMPTY_SNAPSHOT);
    assert.equal(snapshot.version, "6");
    assert.equal(snapshot.dialect, "sqlite");
    assert.deepEqual(Object.keys(snapshot.tables).toSorted(), [
      "account",
      "invitation",
      "ledger_entry",
      "member",
      "organization",
      "party",
      "session",
      "user",
      "verification",
    ]);
  });

  it("pairs the snapshot with the last migration and ships a journal", () => {
    const last = seed.migrations.at(-1);
    assert.ok(last);
    assert.ok(
      seed.sourceFiles[
        snapshotPathFor(
          `migrations/${last.id}.sql`,
          MANIFEST
        ) as keyof typeof seed.sourceFiles
      ]
    );
    assert.ok(
      seed.sourceFiles[journalPath(MANIFEST) as keyof typeof seed.sourceFiles]
    );
  });
});

const LEGACY_SNAP = JSON.stringify({ tables: [] });

function legacyTree(): Record<string, string> {
  return workspace({
    "migrations/0001_auth.sql": "CREATE TABLE user (id TEXT);",
    "migrations/0002_erp.sql": "CREATE TABLE party (id TEXT);",
    "migrations/meta/0002_erp_snapshot.json": LEGACY_SNAP,
  });
}

function applyConversion(
  files: Record<string, string>,
  snapshot: string,
  conversion: ReturnType<typeof convertLegacyMeta>
): Record<string, string> {
  const next = { ...files };
  for (const path of conversion.deletePaths) {
    delete next[path];
  }
  next[conversion.snapshotPath] = snapshot;
  next[conversion.journalPath] = serializeJournal(conversion.journal);
  return next;
}

describe("legacy schema meta", () => {
  it("CD error kind is schema_meta_legacy, not a missing migration", () => {
    const failure = legacySchemaGateFailure(legacyTree(), MANIFEST);
    assert.ok(failure);
    assert.equal(failure.error, SCHEMA_META_LEGACY);
    assert.equal(failure.message, LEGACY_META_CD_MESSAGE);
    assert.equal(isLegacySchemaMeta(legacyTree(), MANIFEST), true);
  });

  it("treats sql files without a journal as legacy", () => {
    const files = workspace({
      "migrations/0001_auth.sql": "CREATE TABLE user (id TEXT);",
    });
    assert.equal(isLegacySchemaMeta(files, MANIFEST), true);
  });

  it("treats a kit-named snapshot that is not version-6 as legacy", () => {
    const files = workspace({
      "migrations/0001_auth.sql": "CREATE TABLE user (id TEXT);",
      "migrations/meta/0001_snapshot.json": LEGACY_SNAP,
    });
    assert.equal(isLegacySchemaMeta(files, MANIFEST), true);
  });

  it("does not flag the seeded kit meta as legacy", () => {
    assert.equal(isLegacySchemaMeta(seed.sourceFiles, MANIFEST), false);
    assert.equal(legacySchemaGateFailure(seed.sourceFiles, MANIFEST), null);
  });

  it("db:generate conversion writes kit snapshot and journal, deletes legacy, no SQL", () => {
    const files = legacyTree();
    const conversion = convertLegacyMeta(files, MANIFEST, 1_752_000_000_000);
    assert.equal(conversion.snapshotPath, "migrations/meta/0002_snapshot.json");
    assert.equal(conversion.journalPath, "migrations/meta/_journal.json");
    assert.deepEqual(conversion.deletePaths, [
      "migrations/meta/0002_erp_snapshot.json",
    ]);
    assert.ok(conversion.message.includes("no SQL"));
    assert.ok(
      conversion.message.includes(
        "Baseline taken from the current schema; verify against the applied ledger"
      )
    );
    assert.deepEqual(
      conversion.journal.entries.map((entry) => ({
        idx: entry.idx,
        tag: entry.tag,
      })),
      [
        { idx: 1, tag: "0001_auth" },
        { idx: 2, tag: "0002_erp" },
      ]
    );
    assert.equal(
      files["migrations/0001_auth.sql"]?.includes("CREATE TABLE"),
      true
    );
    assert.equal(
      files["migrations/0002_erp.sql"]?.includes("CREATE TABLE"),
      true
    );
  });

  it("a second db:generate after conversion is a no-op against the written snapshot", async () => {
    const { generateSQLiteMigration } = await import("drizzle-kit/api");
    const snap =
      seed.sourceFiles[
        "migrations/meta/0002_snapshot.json" as keyof typeof seed.sourceFiles
      ];
    assert.ok(snap);
    const converted = applyConversion(
      legacyTree(),
      snap,
      convertLegacyMeta(legacyTree(), MANIFEST, 1)
    );
    assert.equal(isLegacySchemaMeta(converted, MANIFEST), false);
    assert.equal(legacySchemaGateFailure(converted, MANIFEST), null);
    const prev = latestSnapshot(converted, MANIFEST);
    const sql = await generateSQLiteMigration(prev, prev);
    assert.deepEqual(sql, []);
    assert.equal(
      converted["migrations/meta/0002_erp_snapshot.json"],
      undefined
    );
    assert.ok(converted["migrations/0001_auth.sql"]);
    assert.ok(converted["migrations/0002_erp.sql"]);
  });
});
