import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  type AppMigration,
  applyPendingMigrations,
  collectMigrations,
  type ExecSql,
  migrationChecksum,
  nextMigrationPath,
  SCHEMA_VERSION_DDL,
} from "./app-migrations.ts";

const MANIFEST = seed.manifest as ManifestV0;

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
      collectMigrations(files, MANIFEST).map((m) => m.id),
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
      collectMigrations(files, MANIFEST).map((m) => m.id),
      ["0001_auth", "0002_notes", "0010_late"]
    );
  });
});

describe("nextMigrationPath", () => {
  it("starts at 0001 in an app with no migrations", () => {
    assert.equal(
      nextMigrationPath(workspace(), MANIFEST, "add expenses"),
      "migrations/0001_add_expenses.sql"
    );
  });

  it("continues from the highest existing number", () => {
    const files = workspace(
      "migrations/0001_auth.sql",
      "migrations/0002_notes.sql"
    );
    assert.equal(
      nextMigrationPath(files, MANIFEST, "expenses"),
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
      nextMigrationPath(files, MANIFEST, "expenses"),
      "migrations/0004_expenses.sql"
    );
  });

  it("reduces a name to something safe for a filename", () => {
    assert.equal(
      nextMigrationPath(workspace(), MANIFEST, "Add Expenses (v2)!"),
      "migrations/0001_add_expenses_v2.sql"
    );
    assert.equal(
      nextMigrationPath(workspace(), MANIFEST, "///"),
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

function ledgerIds(exec: ExecSql): string[] {
  return exec("SELECT id FROM _sfab_migrations ORDER BY ordinal").map((row) =>
    String(row.id)
  );
}

/** The same migration, edited after the fact. */
function edited(id: string, sql: string): AppMigration[] {
  return MIGRATIONS.map((m) => (m.id === id ? { id, sql } : m));
}

const CONTENTS_CHANGED = /0001_auth.*contents have changed/s;
const NOT_FILE_1 = /no longer file 1/;
const RAN_MORE_THAN_HELD = /has run 2 migrations but migrations\/ holds 1/;
const RENAMED = /0002_notes.*no longer file 2/s;

describe("applyPendingMigrations", () => {
  it("runs every migration on an empty database", () => {
    const exec = database();
    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 0,
      applied: 2,
    });
    assert.deepEqual(tableNames(exec), ["note", "user"]);
    assert.deepEqual(ledgerIds(exec), ["0001_auth", "0002_notes"]);
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
    assert.deepEqual(ledgerIds(exec), [
      "0001_auth",
      "0002_notes",
      "0003_expenses",
    ]);
  });

  /**
   * A stray count row is what an older build could leave behind. Once a ledger
   * exists it is not consulted, so it cannot re-run anything.
   */
  it("ignores the legacy count once a ledger exists", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    exec("INSERT INTO _sfab_schema_version (version) VALUES (1)");
    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 2,
      applied: 0,
    });
  });
});

describe("applyPendingMigrations — history that has already run", () => {
  /**
   * The database an older build left behind: a count, and no ledger. The first
   * `N` files are the only thing that count can mean, so they are adopted
   * rather than re-run — re-running would fail on the first `CREATE TABLE`.
   */
  it("adopts the files a counted database must have applied", () => {
    const exec = database();
    for (const migration of MIGRATIONS) {
      exec(migration.sql);
    }
    exec("INSERT INTO _sfab_schema_version (version) VALUES (2)");

    assert.deepEqual(applyPendingMigrations(exec, MIGRATIONS), {
      previousVersion: 2,
      applied: 0,
    });
    assert.deepEqual(ledgerIds(exec), ["0001_auth", "0002_notes"]);
  });

  it("refuses a migration edited after it was applied", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    assert.throws(
      () =>
        applyPendingMigrations(
          exec,
          edited(
            "0001_auth",
            "CREATE TABLE user (id TEXT PRIMARY KEY, x TEXT);"
          )
        ),
      CONTENTS_CHANGED
    );
  });

  it("refuses a migration that is no longer where it was applied", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    assert.throws(
      () => applyPendingMigrations(exec, [...MIGRATIONS].reverse()),
      NOT_FILE_1
    );
  });

  it("refuses a database holding more migrations than the workspace", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    assert.throws(
      () => applyPendingMigrations(exec, MIGRATIONS.slice(0, 1)),
      RAN_MORE_THAN_HELD
    );
  });

  /** Renaming the file is the same act as editing it, and reads the same. */
  it("refuses a renamed migration", () => {
    const exec = database();
    applyPendingMigrations(exec, MIGRATIONS);
    const renamed = MIGRATIONS.map((m) =>
      m.id === "0002_notes" ? { ...m, id: "0002_memos" } : m
    );
    assert.throws(() => applyPendingMigrations(exec, renamed), RENAMED);
  });
});

describe("migrationChecksum", () => {
  it("separates contents that differ by one byte", () => {
    assert.notEqual(
      migrationChecksum("SELECT 1;"),
      migrationChecksum("SELECT 2;")
    );
  });

  it("is stable across calls", () => {
    assert.equal(
      migrationChecksum("SELECT 1;"),
      migrationChecksum("SELECT 1;")
    );
  });
});
