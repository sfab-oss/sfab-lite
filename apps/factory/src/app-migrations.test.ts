import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  type AppMigration,
  applyPendingMigrations,
  collectMigrations,
  type ExecSql,
  nextMigrationPath,
  readSchemaVersion,
  SCHEMA_VERSION_DDL,
} from "./app-migrations.ts";

function workspace(...paths: string[]): Record<string, string> {
  const files: Record<string, string> = {
    "src/db/schema.ts": "// schema",
  };
  for (const path of paths) {
    files[path] = `-- ${path}`;
  }
  return files;
}

describe("collectMigrations", () => {
  it("takes only .sql files under the migrations directory", () => {
    const files = workspace(
      "migrations/0001_auth.sql",
      "migrations/README.md",
      "src/migrations-helper.ts"
    );
    assert.deepEqual(
      collectMigrations(files).map((m) => m.id),
      ["0001_auth"]
    );
  });

  /**
   * Order is the schema history: `0002` must run after `0001` or a table gets
   * altered before it exists. Object key order is not a guarantee worth
   * resting that on, so the sort is explicit and this pins it.
   */
  it("orders by filename regardless of how the workspace enumerates", () => {
    const files = workspace(
      "migrations/0010_late.sql",
      "migrations/0002_notes.sql",
      "migrations/0001_auth.sql"
    );
    assert.deepEqual(
      collectMigrations(files).map((m) => m.id),
      ["0001_auth", "0002_notes", "0010_late"]
    );
  });
});

describe("nextMigrationPath", () => {
  it("starts at 0001 in an app with no migrations", () => {
    assert.equal(
      nextMigrationPath(workspace(), "add expenses"),
      "migrations/0001_add_expenses.sql"
    );
  });

  it("continues from the highest existing number", () => {
    const files = workspace(
      "migrations/0001_auth.sql",
      "migrations/0002_notes.sql"
    );
    assert.equal(
      nextMigrationPath(files, "expenses"),
      "migrations/0003_expenses.sql"
    );
  });

  /**
   * Counting migrations instead of reading the highest number would return
   * `0003` here and silently overwrite `0003_notes.sql`, destroying a
   * migration that had already run against live databases.
   */
  it("does not collide when the sequence has a gap", () => {
    const files = workspace(
      "migrations/0001_auth.sql",
      "migrations/0003_notes.sql"
    );
    assert.equal(
      nextMigrationPath(files, "expenses"),
      "migrations/0004_expenses.sql"
    );
  });

  it("reduces a name to something safe for a filename", () => {
    assert.equal(
      nextMigrationPath(workspace(), "Add Expenses (v2)!"),
      "migrations/0001_add_expenses_v2.sql"
    );
    assert.equal(
      nextMigrationPath(workspace(), "///"),
      "migrations/0001_schema.sql"
    );
  });
});

/**
 * Run against real SQLite, because the bug this guards against was a property
 * of SQLite rather than of the loop: `version` is the primary key, so
 * `INSERT OR REPLACE` inserted a *second* row instead of replacing the first,
 * and reading one arbitrarily re-ran a migration that had already been applied.
 * A deploy then failed with "table already exists" — on the second deploy of
 * any app whose schema had ever changed.
 */
function database(): ExecSql {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_VERSION_DDL);
  return (query, ...binds) =>
    db.prepare(query).all(...(binds as [])) as Record<string, unknown>[];
}

const MIGRATIONS: AppMigration[] = [
  { id: "0001_auth", sql: "CREATE TABLE user (id TEXT PRIMARY KEY);" },
  { id: "0002_notes", sql: "CREATE TABLE note (id TEXT PRIMARY KEY);" },
];

function tableNames(exec: ExecSql): string[] {
  return exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_sfab_%' ORDER BY name"
  ).map((row) => String(row.name));
}

describe("applyPendingMigrations", () => {
  it("runs every migration on an empty database", () => {
    const exec = database();
    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 0,
      applied: 2,
    });
    assert.deepEqual(tableNames(exec), ["note", "user"]);
    assert.equal(readSchemaVersion(exec), 2);
  });

  it("does nothing when the database is already current", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 2,
      applied: 0,
    });
  });

  it("runs only the new migration when one is appended", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    const grown = [
      ...MIGRATIONS,
      {
        id: "0003_expenses",
        sql: "CREATE TABLE expense (id TEXT PRIMARY KEY);",
      },
    ];
    assert.deepEqual(applyPendingMigrations(exec, grown), {
      previousVersion: 2,
      applied: 1,
    });
    assert.deepEqual(tableNames(exec), ["expense", "note", "user"]);
  });

  /**
   * The regression itself: growing the list then re-applying it must not
   * re-run `0003`. Before the fix this threw "table `expense` already exists".
   */
  it("stays idempotent after the migration list grows", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    const grown = [
      ...MIGRATIONS,
      {
        id: "0003_expenses",
        sql: "CREATE TABLE expense (id TEXT PRIMARY KEY);",
      },
    ];
    applyPendingMigrations(exec, grown);
    assert.deepEqual(applyPendingMigrations(exec, grown), {
      previousVersion: 3,
      applied: 0,
    });
    assert.equal(
      exec("SELECT COUNT(*) AS n FROM _sfab_schema_version")[0]?.n,
      1
    );
  });

  /** A database an older build left with several rows must still read true. */
  it("recovers a database that already has duplicate version rows", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    exec("INSERT INTO _sfab_schema_version (version) VALUES (1)");
    assert.equal(readSchemaVersion(exec), 2);
    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 2,
      applied: 0,
    });
  });
});
