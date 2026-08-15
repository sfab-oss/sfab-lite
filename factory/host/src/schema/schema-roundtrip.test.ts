import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  diffSchema,
  type ExecRows,
  introspectSchema,
  type TableSpec,
} from "./schema-ddl.ts";

/**
 * Real SQLite, not a fake. The whole point of introspection is that it agrees
 * with what a database actually reports, so a hand-written fixture of PRAGMA
 * rows would only prove this module agrees with my guess about them.
 */
function open(...statements: string[]): ExecRows {
  const db = new DatabaseSync(":memory:");
  for (const sql of statements) {
    db.exec(sql);
  }
  return (query) => db.prepare(query).all() as Record<string, unknown>[];
}

function seeded(): ExecRows {
  return open(...seed.migrations.map((m) => m.sql));
}

const NOW_MS = "(cast(unixepoch('subsecond') * 1000 as integer))";

function tableNamed(exec: ExecRows, name: string): TableSpec {
  const found = introspectSchema(exec).tables.find((t) => t.name === name);
  assert.ok(found, `expected table ${name}`);
  return found;
}

describe("introspectSchema", () => {
  it("reads every table the seed migrations create", () => {
    const names = introspectSchema(seeded())
      .tables.map((t) => t.name)
      .filter((n) => !n.startsWith("sqlite_"));
    assert.deepEqual(names, [
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

  it("reads columns, types, nullability, and defaults", () => {
    const line = tableNamed(seeded(), "ledger_entry");
    assert.deepEqual(line.primaryKey, ["id"]);
    assert.deepEqual(
      line.columns.map((c) => c.name),
      [
        "id",
        "organization_id",
        "party_id",
        "kind",
        "amount_cents",
        "memo",
        "created_at",
      ]
    );
    const memo = line.columns.find((c) => c.name === "memo");
    assert.equal(memo?.type, "text");
    assert.equal(memo?.notNull, false);
    assert.equal(memo?.defaultSql, null);
    const amount = line.columns.find((c) => c.name === "amount_cents");
    assert.equal(amount?.type, "integer");
    assert.equal(amount?.notNull, true);
    assert.equal(amount?.defaultSql, null);
  });

  it("reads a declared index and a unique index alike", () => {
    const exec = seeded();
    const line = tableNamed(exec, "ledger_entry");
    assert.deepEqual(line.indexes, [
      {
        name: "ledger_entry_partyId_idx",
        columns: ["party_id"],
        unique: false,
      },
      {
        name: "ledger_entry_organizationId_idx",
        columns: ["organization_id"],
        unique: false,
      },
    ]);
    const user = tableNamed(exec, "user");
    const email = user.indexes.find((i) => i.name === "user_email_unique");
    assert.equal(email?.unique, true);
    assert.deepEqual(email?.columns, ["email"]);
  });

  it("does not report the index SQLite creates for a UNIQUE constraint", () => {
    const exec = open(
      "CREATE TABLE t (id text PRIMARY KEY NOT NULL, slug text UNIQUE);"
    );
    assert.deepEqual(tableNamed(exec, "t").indexes, []);
  });

  /**
   * SQLite rewrites the storage classes it recognises to upper case and echoes
   * anything else exactly as declared. Drizzle reports lower case, so without
   * canonicalising, every column of every table would read as a type change.
   */
  it("canonicalises the type case SQLite reports", () => {
    const exec = open(
      "CREATE TABLE t (`a` text, `b` INTEGER, `c` VaRcHaR(9));"
    );
    assert.deepEqual(
      tableNamed(exec, "t").columns.map((c) => c.type),
      ["text", "integer", "varchar(9)"]
    );
  });

  /**
   * SQLite strips the outer parentheses from an expression default, and
   * re-emitting one without them is a syntax error. Literals must survive
   * untouched, or `DEFAULT ''` would come back as `DEFAULT ('')`.
   */
  it("restores the parentheses SQLite strips from expression defaults", () => {
    const exec = open(
      `CREATE TABLE t (
        \`a\` integer DEFAULT ${NOW_MS},
        \`b\` text DEFAULT '',
        \`c\` integer DEFAULT 0,
        \`d\` integer DEFAULT false,
        \`e\` text DEFAULT 'it''s'
      );`
    );
    assert.deepEqual(
      tableNamed(exec, "t").columns.map((c) => c.defaultSql),
      [NOW_MS, "''", "0", "false", "'it''s'"]
    );
  });

  it("recovers the column order of a composite primary key", () => {
    const exec = open(
      "CREATE TABLE t (a text NOT NULL, b text NOT NULL, PRIMARY KEY(`b`,`a`));"
    );
    assert.deepEqual(tableNamed(exec, "t").primaryKey, ["b", "a"]);
  });
});

/**
 * The property everything else rests on: what the emitter writes and what the
 * introspector reads back must describe the same table. If they ever disagree,
 * a deploy diffs a schema against itself and finds spurious changes — the exact
 * failure this whole mechanism exists to prevent, arriving from the other side.
 */
describe("emit and introspect round-trip", () => {
  const cases: TableSpec[] = [
    {
      name: "expenses",
      columns: [
        { name: "id", type: "text", notNull: true, defaultSql: null },
        {
          name: "organization_id",
          type: "text",
          notNull: true,
          defaultSql: null,
        },
        { name: "amount", type: "integer", notNull: true, defaultSql: null },
        { name: "note", type: "text", notNull: false, defaultSql: null },
        {
          name: "created_at",
          type: "integer",
          notNull: true,
          defaultSql: NOW_MS,
        },
      ],
      primaryKey: ["id"],
      indexes: [
        {
          name: "expenses_org_idx",
          columns: ["organization_id"],
          unique: false,
        },
      ],
      foreignKeys: [],
    },
    {
      name: "membership",
      columns: [
        { name: "org_id", type: "text", notNull: true, defaultSql: null },
        { name: "user_id", type: "text", notNull: true, defaultSql: null },
        { name: "role", type: "text", notNull: true, defaultSql: "'member'" },
      ],
      primaryKey: ["org_id", "user_id"],
      indexes: [],
      foreignKeys: [],
    },
  ];

  for (const spec of cases) {
    it(`survives a round-trip for ${spec.name}`, () => {
      const diff = diffSchema({ tables: [] }, { tables: [spec] });
      const exec = open(...diff.statements);
      assert.deepEqual(tableNamed(exec, spec.name), spec);
    });
  }

  it("finds nothing to do when the database already matches", () => {
    const desired = { tables: cases };
    const exec = open(...diffSchema({ tables: [] }, desired).statements);
    const second = diffSchema(introspectSchema(exec), desired);
    assert.deepEqual(second.blocking, []);
    assert.deepEqual(second.statements, []);
  });

  /**
   * The same idempotence, but starting from the seed the factory actually
   * ships: introspecting a freshly bootstrapped app and diffing it against
   * itself must be a no-op, or every deploy would try to re-create the tables
   * better-auth is already using.
   */
  it("finds nothing to do against a freshly seeded app", () => {
    const exec = seeded();
    const diff = diffSchema(introspectSchema(exec), introspectSchema(exec));
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, []);
  });

  it("emits SQLite accepts when adding a column to a live table", () => {
    const exec = seeded();
    const before = tableNamed(exec, "party");
    const desired: TableSpec = {
      ...before,
      columns: [
        ...before.columns,
        {
          name: "archived",
          type: "integer",
          notNull: true,
          defaultSql: "0",
        },
      ],
    };
    const diff = diffSchema({ tables: [before] }, { tables: [desired] });
    assert.deepEqual(diff.blocking, []);
    for (const statement of diff.statements) {
      exec(statement);
    }
    const after = tableNamed(exec, "party");
    assert.equal(
      after.columns.find((c) => c.name === "archived")?.notNull,
      true
    );
  });
});
