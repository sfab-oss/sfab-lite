import assert from "node:assert/strict";
import { describe, it } from "node:test";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "../../../../starters/erp/app/src/db/auth.ts";
import {
  ledgerEntry,
  party,
} from "../../../../starters/erp/app/src/db/ledger.ts";
import { classifySql } from "./classify-sql.ts";
import { probeEntrySource } from "./schema-probe-source.ts";

const schema = {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
  ledgerEntry,
  party,
};

const EXPECTED_TABLES = [
  "account",
  "invitation",
  "ledger_entry",
  "member",
  "organization",
  "party",
  "session",
  "user",
  "verification",
];

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /--[^\n]*/g;
const WHITESPACE = /\s+/g;
const DROP_PARTY = /DROP TABLE\s+`party`/i;

function statementSet(sql: string): Set<string> {
  const stripped = sql.replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, " ");
  return new Set(
    stripped
      .split(";")
      .map((part) => part.replace(WHITESPACE, " ").trim())
      .filter((part) => part.length > 0)
  );
}

describe("probeEntrySource", () => {
  it("imports drizzle-kit generate and the app schema", () => {
    const source = probeEntrySource(seed.manifest.schema);
    assert.ok(source.includes("generateSQLiteDrizzleJson"));
    assert.ok(source.includes("generateSQLiteMigration"));
    assert.ok(source.includes('from "./api.mjs"'));
    assert.ok(source.includes("./db/schema.ts"));
  });
});

describe("template schema and seed migrations agree", () => {
  it("kit generate from empty matches the seed SQL statements", async () => {
    const empty = await generateSQLiteDrizzleJson({});
    const current = await generateSQLiteDrizzleJson(schema);
    const sql = await generateSQLiteMigration(empty, current);
    assert.deepEqual(Object.keys(current.tables ?? {}).sort(), EXPECTED_TABLES);
    const kit = statementSet(sql.join(";\n"));
    const fixture = statementSet(seed.migrations.map((m) => m.sql).join("\n"));
    assert.deepEqual(kit, fixture);
  });

  it("refuses a destructive diff", async () => {
    const current = await generateSQLiteDrizzleJson(schema);
    const { party: _removed, ...tables } = current.tables;
    const dropped = {
      ...current,
      tables,
      id: "drop-probe",
      prevId: current.id,
    };
    const sql = await generateSQLiteMigration(current, dropped);
    const classified = classifySql(sql);
    assert.ok(classified.blocking.length > 0);
    assert.ok(classified.blocking.some((s) => DROP_PARTY.test(s)));
  });
});
