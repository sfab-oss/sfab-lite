import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  canonicalizeSnapshot,
  diffSchema,
  introspectSchema,
  type SchemaSnapshot,
} from "./schema-ddl.ts";
import { probeEntrySource } from "./schema-probe-source.ts";

/**
 * The probe is executed here for real, against real drizzle, over the real
 * template schema — everything except the bundling and Worker Loader transport,
 * which the server bundle already exercises on every deploy.
 *
 * It has to run from inside the template app: the generated source imports the
 * schema by a path relative to itself, and drizzle only resolves from there.
 * The file is written and removed around the run; its name is gitignored so a
 * crash cannot leave the template dirty.
 */
const APP_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../starters/erp/app/src"
);
const SCRATCH = join(APP_SRC, "__sfab_probe_check.ts");

after(() => rmSync(SCRATCH, { force: true }));

async function runProbe(): Promise<SchemaSnapshot> {
  mkdirSync(dirname(SCRATCH), { recursive: true });
  writeFileSync(SCRATCH, probeEntrySource("src/db/schema/index.ts"));
  const mod = (await import(`${SCRATCH}?t=${seed.migrations.length}`)) as {
    default: { fetch: () => Response };
  };
  const body = (await mod.default.fetch().json()) as {
    ok: boolean;
    error?: string;
    tables?: SchemaSnapshot["tables"];
  };
  assert.ok(body.ok, `probe failed: ${body.error}`);
  return canonicalizeSnapshot({ tables: body.tables ?? [] });
}

function seededDatabase() {
  const db = new DatabaseSync(":memory:");
  for (const migration of seed.migrations) {
    db.exec(migration.sql);
  }
  return (query: string) =>
    db.prepare(query).all() as Record<string, unknown>[];
}

describe("probeEntrySource", () => {
  it("reports every table the template declares", async () => {
    const snapshot = await runProbe();
    assert.deepEqual(snapshot.tables.map((t) => t.name).sort(), [
      "account",
      "document",
      "document_line",
      "entity",
      "invitation",
      "member",
      "organization",
      "product",
      "session",
      "user",
      "verification",
    ]);
  });

  it("reads defaults, keys, indexes, and foreign keys off the document table", async () => {
    const document = (await runProbe()).tables.find(
      (t) => t.name === "document"
    );
    assert.ok(document);
    assert.deepEqual(document.primaryKey, ["id"]);
    assert.equal(
      document.columns.find((c) => c.name === "status")?.defaultSql,
      "'draft'"
    );
    assert.equal(
      document.columns.find((c) => c.name === "created_at")?.defaultSql,
      "(cast(unixepoch('subsecond') * 1000 as integer))"
    );
    assert.deepEqual(document.indexes, [
      {
        name: "document_organizationId_idx",
        columns: ["organization_id"],
        unique: false,
      },
      {
        name: "document_entityId_idx",
        columns: ["entity_id"],
        unique: false,
      },
      {
        name: "document_organizationId_number_unique",
        columns: ["organization_id", "number"],
        unique: true,
      },
    ]);
    assert.deepEqual(document.foreignKeys, [
      {
        columns: ["organization_id"],
        refTable: "organization",
        refColumns: ["id"],
        onUpdate: "no action",
        onDelete: "cascade",
      },
      {
        columns: ["entity_id"],
        refTable: "entity",
        refColumns: ["id"],
        onUpdate: "no action",
        onDelete: "restrict",
      },
    ]);
  });

  /**
   * `$onUpdate` sets `hasDefault` without giving the column any SQL default.
   * Branching on `hasDefault` would emit `DEFAULT undefined`; drizzle-kit
   * writes `session.updated_at` with no default at all, and so must we.
   */
  it("gives no default to a column that only has an onUpdate hook", async () => {
    const session = (await runProbe()).tables.find((t) => t.name === "session");
    assert.equal(
      session?.columns.find((c) => c.name === "updated_at")?.defaultSql,
      null
    );
  });

  /**
   * `uniqueName` is populated on every column whether or not it is unique, so
   * this fails loudly if the probe ever branches on the name instead of the
   * flag — the symptom would be a unique index invented on every column.
   */
  it("emits a unique index only for columns actually marked unique", async () => {
    const user = (await runProbe()).tables.find((t) => t.name === "user");
    assert.deepEqual(user?.indexes, [
      { name: "user_email_unique", columns: ["email"], unique: true },
    ]);
  });
});

/**
 * The assertion this whole branch exists to make true.
 *
 * The declared schema and the migrations that build the database are two
 * descriptions of one thing, and nothing until now checked that they agreed.
 * Diffing a freshly migrated database against what the code declares must find
 * nothing to do — and had this test existed, the shipped bug would have failed
 * it.
 */
describe("template schema and seed migrations agree", () => {
  it("finds no difference between declared and migrated", async () => {
    const desired = await runProbe();
    const actual = introspectSchema(seededDatabase());
    const diff = diffSchema(actual, desired);
    assert.deepEqual(diff.blocking, []);
    assert.deepEqual(diff.statements, []);
  });
});
