import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import { EMPTY_SNAPSHOT } from "./schema-kit.ts";
import {
  appendJournalEntry,
  journalPath,
  latestSnapshot,
  serializeSnapshot,
  snapshotPathFor,
} from "./schema-snapshots.ts";

const MANIFEST = {
  format: 0,
  name: "fixture",
  runtime: "^0",
  adapter: "cloudflare" as const,
  root: "app",
  server: { entry: "src/server.ts", exportName: "app" },
  client: { entry: "src/router.tsx", styles: "src/styles.css" },
  html: "index.html",
  safelist: "safelist.txt",
  migrations: "migrations",
  schema: "src/db/schema.ts",
  inject: {},
  source: {
    dirs: ["src"],
    extensions: [".ts"],
    files: ["package.json"],
    exclude: [],
  },
  capabilities: [],
  modules: [],
  recipes: {},
} satisfies ManifestV0;

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

describe("appendJournalEntry", () => {
  it("appends idx from the tag prefix", () => {
    const files = workspace({});
    const journal = appendJournalEntry(files, MANIFEST, "0002_erp", 10);
    assert.deepEqual(journal.entries, [
      {
        idx: 2,
        version: "6",
        when: 10,
        tag: "0002_erp",
        breakpoints: true,
      },
    ]);
    assert.equal(journalPath(MANIFEST), "migrations/meta/_journal.json");
  });
});
