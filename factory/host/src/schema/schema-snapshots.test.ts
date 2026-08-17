import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  EMPTY_SNAPSHOT,
  journalPath,
  latestSnapshot,
  serializeJournal,
  snapshotPathFor,
} from "@sfab-lite/verbs/db";
import {
  convertLegacyMeta,
  isLegacySchemaMeta,
  LEGACY_META_CD_MESSAGE,
  legacySchemaGateFailure,
  SCHEMA_META_LEGACY,
} from "./schema-snapshots.ts";

const MANIFEST = seed.manifest as ManifestV0;

const LEGACY_SNAP = JSON.stringify({ tables: [] });

function workspace(entries: Record<string, string>): Record<string, string> {
  return { "src/db/schema.ts": "// schema", ...entries };
}

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
