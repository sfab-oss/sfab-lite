import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySql } from "./classify-sql.ts";

const cases: { kind: "additive" | "blocking"; sql: string }[] = [
  {
    kind: "additive",
    sql: "CREATE TABLE `notes` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n",
  },
  {
    kind: "additive",
    sql: "ALTER TABLE `notes` ADD `body` text;",
  },
  {
    kind: "additive",
    sql: "ALTER TABLE `notes` ADD COLUMN `archived` integer DEFAULT 0 NOT NULL;",
  },
  {
    kind: "additive",
    sql: "CREATE INDEX `notes_idx` ON `notes` (`id`);",
  },
  {
    kind: "additive",
    sql: "CREATE UNIQUE INDEX `notes_slug_unique` ON `notes` (`slug`);",
  },
  {
    kind: "additive",
    sql: "DROP INDEX `notes_idx`;",
  },
  {
    kind: "blocking",
    sql: "DROP TABLE `party`;",
  },
  {
    kind: "blocking",
    sql: "ALTER TABLE `party` DROP COLUMN `tax_id`;",
  },
  {
    kind: "blocking",
    sql: "ALTER TABLE `party` DROP `tax_id`;",
  },
  {
    kind: "blocking",
    sql: "CREATE TABLE `__new_party` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n",
  },
  {
    kind: "blocking",
    sql: "INSERT INTO `__new_party` SELECT * FROM `party`;",
  },
  {
    kind: "blocking",
    sql: "ALTER TABLE `__new_party` RENAME TO `party`;",
  },
  {
    kind: "blocking",
    sql: "PRAGMA foreign_keys=OFF;",
  },
];

describe("classifySql", () => {
  for (const { kind, sql } of cases) {
    it(`${kind}: ${sql.split("\n")[0]}`, () => {
      const result = classifySql([sql]);
      if (kind === "additive") {
        assert.deepEqual(result.blocking, []);
        assert.deepEqual(result.additive, [sql]);
      } else {
        assert.deepEqual(result.additive, []);
        assert.deepEqual(result.blocking, [sql]);
      }
    });
  }

  it("strips kit breakpoint markers before classifying", () => {
    const sql = "--> statement-breakpoint\nCREATE INDEX `n` ON `t` (`id`);";
    const result = classifySql([sql]);
    assert.deepEqual(result.blocking, []);
    assert.deepEqual(result.additive, [sql]);
  });

  it("treats a statement that is only a breakpoint as empty", () => {
    const result = classifySql(["--> statement-breakpoint"]);
    assert.deepEqual(result, { additive: [], blocking: [] });
  });

  it("fails closed on unknown statement kinds and keeps the text", () => {
    const sql = "VACUUM;";
    const result = classifySql([sql]);
    assert.deepEqual(result.additive, []);
    assert.deepEqual(result.blocking, [sql]);
  });
});
