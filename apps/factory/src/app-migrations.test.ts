import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectMigrations, nextMigrationPath } from "./app-migrations.ts";

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
