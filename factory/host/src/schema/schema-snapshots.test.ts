import assert from "node:assert/strict";
import { describe, it } from "node:test";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  EMPTY_SNAPSHOT,
  latestSnapshot,
  serializeSnapshot,
  snapshotPathFor,
} from "./schema-snapshots.ts";

const BAD_JSON = /is not valid JSON/;
const byName = (a: string, b: string) => a.localeCompare(b);

function workspace(entries: Record<string, string>): Record<string, string> {
  return { "src/db/schema.ts": "// schema", ...entries };
}

describe("snapshotPathFor", () => {
  it("names the snapshot after the migration it belongs to", () => {
    assert.equal(
      snapshotPathFor("migrations/0003_water_delivery.sql"),
      "migrations/meta/0003_water_delivery_snapshot.json"
    );
  });
});

describe("latestSnapshot", () => {
  it("reads an app with no migrations as having no tables", () => {
    assert.deepEqual(latestSnapshot(workspace({})), EMPTY_SNAPSHOT);
  });

  /**
   * Highest filename wins for the same reason migrations run in filename
   * order: the number is the history. Taking an arbitrary one would diff
   * against a schema two migrations stale and re-propose what already ran.
   */
  it("takes the highest-numbered snapshot, not the first found", () => {
    const files = workspace({
      "migrations/meta/0003_late_snapshot.json": JSON.stringify({
        tables: [{ name: "late", columns: [], primaryKey: [], indexes: [] }],
      }),
      "migrations/meta/0001_early_snapshot.json": JSON.stringify({
        tables: [{ name: "early", columns: [], primaryKey: [], indexes: [] }],
      }),
    });
    assert.deepEqual(
      latestSnapshot(files).tables.map((t) => t.name),
      ["late"]
    );
  });

  it("ignores files under meta/ that are not snapshots", () => {
    const files = workspace({
      "migrations/meta/notes.md": "not a snapshot",
      "migrations/0001_auth.sql": "CREATE TABLE user (id TEXT);",
    });
    assert.deepEqual(latestSnapshot(files), EMPTY_SNAPSHOT);
  });

  /**
   * Reading a corrupt snapshot as "no tables" would generate a migration
   * recreating the entire schema, against a database that already has it.
   * Refusing sends the agent to the file instead.
   */
  it("refuses a snapshot that will not parse", () => {
    const files = workspace({
      "migrations/meta/0001_auth_snapshot.json": "{ not json",
    });
    assert.throws(() => latestSnapshot(files), BAD_JSON);
  });
});

describe("the template ships its own snapshot", () => {
  /**
   * Without one, the first `db:generate` in a freshly seeded app reads the
   * workspace as empty and proposes creating every table the seed migrations
   * already created.
   */
  it("seeds a snapshot describing what the seed migrations produced", () => {
    const snapshot = latestSnapshot(seed.sourceFiles);
    assert.notDeepEqual(snapshot, EMPTY_SNAPSHOT);
    assert.deepEqual(snapshot.tables.map((t) => t.name).toSorted(byName), [
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

  it("pairs the snapshot with the last migration in the seed", () => {
    const last = seed.migrations.at(-1);
    assert.ok(last);
    assert.ok(
      seed.sourceFiles[
        snapshotPathFor(
          `migrations/${last.id}.sql`
        ) as keyof typeof seed.sourceFiles
      ]
    );
  });
});

describe("serializeSnapshot", () => {
  it("round-trips through latestSnapshot", () => {
    const snapshot = latestSnapshot(seed.sourceFiles);
    const files = workspace({
      "migrations/meta/0002_erp_snapshot.json": serializeSnapshot(snapshot),
    });
    assert.deepEqual(latestSnapshot(files), snapshot);
  });
});
