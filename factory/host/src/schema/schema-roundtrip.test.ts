import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySql } from "@sfab-lite/verbs/db";

describe("schema gate red cases", () => {
  it("detects a missing migration from additive kit SQL", () => {
    const sql = [
      "CREATE TABLE `expenses` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n",
    ];
    const diff = classifySql(sql);
    assert.deepEqual(diff.blocking, []);
    assert.equal(diff.additive.length, 1);
  });

  it("detects a destructive diff as blocking", () => {
    const sql = ["DROP TABLE `party`;"];
    const diff = classifySql(sql);
    assert.equal(diff.blocking.length, 1);
    assert.deepEqual(diff.additive, []);
  });
});
