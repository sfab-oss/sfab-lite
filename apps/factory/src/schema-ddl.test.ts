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
    defaultSql: null,
    ...extra,
  } satisfies ColumnSpec;
}

function table(
  name: string,
  columns: ColumnSpec[],
  extra: Partial<Omit<TableSpec, "name" | "columns">> = {}
): TableSpec {
  return {
    name,
    columns,
    primaryKey: [],
    indexes: [],
    foreignKeys: [],
    ...extra,
  };
}

function snapshot(tables: TableSpec[]): SchemaSnapshot {
  return { tables };
}

const NOW_MS = "(cast(unixepoch('subsecond') * 1000 as integer))";

const expenses = table(
  "expenses",
  [
    column("id", "text", { notNull: true }),
    column("organization_id", "text", { notNull: true }),
    column("description", "text", { notNull: true }),
    column("amount", "integer", { notNull: true }),
    column("date", "integer", { notNull: true }),
    column("created_at", "integer", { notNull: true, defaultSql: NOW_MS }),
  ],
  { primaryKey: ["id"] }
);

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
      `\t\`created_at\` integer DEFAULT ${NOW_MS} NOT NULL`,
      ");",
    ].join("\n");
    assert.equal(emitCreateTable(expenses), expected);
  });

  /**
   * The second anchor, and the one that covers foreign keys: this is the
   * `note` table verbatim from `migrations/0002_notes.sql`, which drizzle-kit
   * generated. Every per-org table an app adds will have this exact shape.
   */
  it("matches drizzle-kit's foreign key output byte for byte", () => {
    const note = table(
      "note",
      [
        column("id", "text", { notNull: true }),
        column("organization_id", "text", { notNull: true }),
        column("title", "text", { notNull: true }),
        column("body", "text", { notNull: true, defaultSql: "''" }),
        column("created_at", "integer", { notNull: true, defaultSql: NOW_MS }),
        column("updated_at", "integer", { notNull: true, defaultSql: NOW_MS }),
      ],
      {
        primaryKey: ["id"],
        foreignKeys: [
          {
            columns: ["organization_id"],
            refTable: "organization",
            refColumns: ["id"],
            onUpdate: "no action",
            onDelete: "cascade",
          },
        ],
      }
    );
    const expected = [
      "CREATE TABLE `note` (",
      "\t`id` text PRIMARY KEY NOT NULL,",
      "\t`organization_id` text NOT NULL,",
      "\t`title` text NOT NULL,",
      "\t`body` text DEFAULT '' NOT NULL,",
      `\t\`created_at\` integer DEFAULT ${NOW_MS} NOT NULL,`,
      `\t\`updated_at\` integer DEFAULT ${NOW_MS} NOT NULL,`,
      "\tFOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade",
      ");",
    ].join("\n");
    assert.equal(emitCreateTable(note), expected);
  });

  it("writes a composite key as a table constraint", () => {
    const membership = table(
      "membership",
      [
        column("org_id", "text", { notNull: true }),
        column("user_id", "text", { notNull: true }),
      ],
      { primaryKey: ["org_id", "user_id"] }
    );
    const sql = emitCreateTable(membership);
    assert.ok(!sql.includes("`org_id` text PRIMARY KEY"));
    assert.ok(sql.includes("\tPRIMARY KEY(`org_id`,`user_id`)"));
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
    const before = table("notes", [column("id", "text")], {
      primaryKey: ["id"],
    });
    const after = table(
      "notes",
      [column("id", "text"), column("body", "text")],
      {
        primaryKey: ["id"],
      }
    );
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

  it("ignores factory, SQLite, Durable Object, and miniflare tables", () => {
    const actual = snapshot([
      table("_sfab_versions", [column("id", "text")]),
      table("sqlite_sequence", [column("name", "text")]),
      table("_cf_KV", [column("key", "text")]),
      // Local-dev only, and the reason it is here: it exists under
      // `wrangler dev` and nowhere else, so treating it as the app's would
      // block every local deploy with a failure production never shows.
      table("__miniflare_do_name", [column("id", "integer")]),
    ]);
    const diff = diffSchema(actual, snapshot([expenses]));
    assert.deepEqual(diff.blocking, []);
    assert.equal(diff.additive.length, 1);
  });

  it("accepts a type whose case differs from the declaration", () => {
    const before = table("notes", [column("id", "TEXT")]);
    const after = table("notes", [column("id", "text")]);
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, []);
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

  it("refuses a moved primary key", () => {
    const cols = [column("id", "text"), column("slug", "text")];
    const before = table("notes", cols, { primaryKey: ["id"] });
    const after = table("notes", cols, { primaryKey: ["slug"] });
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "alter_primary_key");
  });

  it("refuses widening a single key into a composite one", () => {
    const cols = [column("id", "text"), column("org_id", "text")];
    const before = table("notes", cols, { primaryKey: ["id"] });
    const after = table("notes", cols, { primaryKey: ["id", "org_id"] });
    const diff = diffSchema(snapshot([before]), snapshot([after]));
    assert.equal(diff.blocking.length, 1);
    assert.equal(diff.blocking[0]?.kind, "alter_primary_key");
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
