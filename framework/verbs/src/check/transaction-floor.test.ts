import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LITE_TX_CODE,
  LITE_TX_MESSAGE,
  transactionFloorDiagnostics,
} from "./transaction-floor.ts";

test("flags .transaction( in app sources with the floor message", () => {
  const diags = transactionFloorDiagnostics({
    "src/hono/org-protected/parties.ts":
      "export async function boom(db: { transaction: Function }) {\n  await db.transaction(async () => undefined);\n}\n",
  });
  assert.equal(diags.length, 1);
  assert.equal(diags[0]?.code, LITE_TX_CODE);
  assert.equal(diags[0]?.message, LITE_TX_MESSAGE);
  assert.equal(diags[0]?.file, "/app/src/hono/org-protected/parties.ts");
  assert.equal(diags[0]?.line, 2);
  assert.ok((diags[0]?.column ?? 0) >= 1);
});

test("skips the generated snapshot tree and the db shim", () => {
  const diags = transactionFloorDiagnostics({
    "src/generated/api.d.ts": "db.transaction();\n",
    "src/db/index.ts": "export const x = db.transaction(() => undefined);\n",
    "src/db/schema.ts": "export const ok = 1;\n",
  });
  assert.deepEqual(diags, []);
});

test("ignores non-src and non-ts files", () => {
  const diags = transactionFloorDiagnostics({
    "migrations/0001.sql": "db.transaction();\n",
    "src/readme.md": "db.transaction();\n",
    "package.json": "{}\n",
  });
  assert.deepEqual(diags, []);
});
