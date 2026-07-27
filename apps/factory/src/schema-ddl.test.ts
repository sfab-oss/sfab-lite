import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ColumnSpec,
  diffSchema,
  emitCreateTable,
  type SchemaSnapshot,
  type TableSpec,
} from "./schema-ddl.ts";

function column(name: string, type: string, extra: Partial<ColumnSpec> = {}) {
  return {
    name,
    type,
    notNull: false,
    primaryKey: false,
    defaultSql: null,
    ...extra,
  } satisfies ColumnSpec;
}

function table(name: string, columns: ColumnSpec[], indexes = []): TableSpec {
  return { name, columns, indexes };
}

function snapshot(tables: TableSpec[]): SchemaSnapshot {
  return { tables };
}

const expenses = table("expenses", [
  column("id", "text", { primaryKey: true, notNull: true }),
  column("organization_id", "text", { notNull: true }),
  column("description", "text", { notNull: true }),
  column("amount", "integer", { notNull: true }),
  column("date", "integer", { notNull: true }),
  column("created_at", "integer", {
    notNull: true,
    defaultSql: "(cast(unixepoch('subsecond') * 1000 as integer))",
  }),
]);

describe("emitCreateTable", () => {
  /**
   * The fixture is drizzle-kit 0.31.10's own output for this schema, captured
   * in artifacts/experiments/drizzle-generate-notes.md (E2). Matching it byte
   * for byte is the strongest available evidence that hand-rolling the emitter
   * did not introduce a subtle difference from the tool everyone else uses.
   */
  it("matches drizzle-kit's output byte for byte", () => {
    const expected = [
      "CREATE TABLE `expenses` (",
      "\t`id` text PRIMARY KEY NOT NULL,",
      "\t`organization_id` text NOT NULL,",
      "\t`description` text NOT NULL,",
      "\t`amount` integer NOT NULL,",
      "\t`date` integer NOT NULL,",
      "\t`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL",
      ");",
    ].join("\n");
    assert.equal(emitCreateTable(expenses), expected);
  });

  it("escapes backticks in identifiers", () => {
    const odd = table("we`ird", [column("a`b", "text")]);
    assert.ok(emitCreateTable(odd).startsWith("CREATE TABLE `we``ird`"));
  });
});

describe("diffSchema — additive", () => {
  it("creates a table that does not exist yet", () => {
    const diff = diffSchema(snapshot([]), snapshot([expenses]));
    assert.deepEqual(diff.blocking, []);
    assert.equal(diff.additive.length, 1);
    assert.equal(diff.statements.length, 1);
    assert.ok((diff.statements[0] ?? "").startsWith("CREATE TABLE `expenses`"));
  });

  it("adds a nullable column to an existing table", () => {
    const before = table("notes", [column("id", "text", { primaryKey: true })]);
    const after = table("notes", [
      column("id", "text", { primaryKey: true }),
      column("body", "text"),
    ]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, ["ALTER TABLE `notes` ADD `body` text;"]);
  });

  it("adds a NOT NULL column when it carries a default", () => {
    const before = table("notes", [column("id", "text")]);
    const after = table("notes", [
      column("id", "text"),
      column("archived", "integer", { notNull: true, defaultSql: "0" }),
    ]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, [
      "ALTER TABLE `notes` ADD `archived` integer DEFAULT 0 NOT NULL;",
    ]);
  });

  it("emits indexes alongside a newly created table", () => {
    const withIndex: TableSpec = {
      ...expenses,
      indexes: [
        {
          name: "expenses_org_idx",
          columns: ["organization_id"],
          unique: false,
        },
      ],
    };
    const diff = diffSchema(snapshot([]), snapshot([withIndex]));
    assert.equal(diff.statements.length, 2);
    assert.equal(
      diff.statements[1],
      "CREATE INDEX `expenses_org_idx` ON `expenses` (`organization_id`);"
    );
  });

  it("ignores the factory's own bookkeeping tables on both sides", () => {
    const actual = snapshot([
      table("_sfab_versions", [column("id", "text")]),
      table("sqlite_sequence", [column("name", "text")]),
    ]);
    const diff = diffSchema(actual, snapshot([expenses]));
    assert.deepEqual(diff.blocking, []);
    assert.equal(diff.additive.length, 1);
  });
});

describe("diffSchema — blocking", () => {
  it("refuses a NOT NULL column with no default", () => {
    const before = table("notes", [column("id", "text")]);
    const after = table("notes", [
      column("id", "text"),
      column("owner", "text", { notNull: true }),
    ]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.deepEqual(diff.statements, []);
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "alter_column");
  });

  it("refuses a vanished table rather than guessing rename versus drop", () => {
    const before = table("notes", [column("id", "text")]);
    const diff = diffSchema(snapshot([before]), snapshot([expenses]));
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "drop_table");
    // The new table is still additive; only the disappearance blocks.
    assert.equal(diff.additive.length, 1);
  });

  it("refuses a dropped column", () => {
    const before = table("notes", [
      column("id", "text"),
      column("body", "text"),
    ]);
    const after = table("notes", [column("id", "text")]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "drop_column");
  });

  it("refuses a changed column type", () => {
    const before = table("notes", [column("amount", "text")]);
    const after = table("notes", [column("amount", "integer")]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "alter_column");
  });

  it("refuses tightening an existing column to NOT NULL", () => {
    const before = table("notes", [column("body", "text")]);
    const after = table("notes", [column("body", "text", { notNull: true })]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.equal(diff.blocking.length, 1);
  });

  it("does not report a dropped index, which carries no data", () => {
    const before: TableSpec = {
      ...table("notes", [column("id", "text")]),
      indexes: [{ name: "notes_idx", columns: ["id"], unique: false }],
    };
    const after = table("notes", [column("id", "text")]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, []);
  });
});
