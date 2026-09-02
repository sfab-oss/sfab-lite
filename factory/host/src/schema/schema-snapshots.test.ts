import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ManifestV0 } from "@sfab-lite/core";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import {
  EMPTY_SNAPSHOT,
  journalPath,
  latestSnapshot,
  snapshotPathFor,
} from "@sfab-lite/verbs/db";

const MANIFEST = seed.manifest as ManifestV0;

describe("the template ships kit meta", () => {
  it("seeds a version-6 snapshot describing the seed schema", () => {
    const snapshot = latestSnapshot(seed.sourceFiles, MANIFEST);
    assert.notDeepEqual(snapshot, EMPTY_SNAPSHOT);
    assert.equal(snapshot.version, "6");
    assert.equal(snapshot.dialect, "sqlite");
    assert.deepEqual(Object.keys(snapshot.tables).toSorted(), [
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

  it("pairs the snapshot with the last migration and ships a journal", () => {
    const last = seed.migrations.at(-1);
    assert.ok(last);
    assert.ok(
      seed.sourceFiles[
        snapshotPathFor(
          `migrations/${last.id}.sql`,
          MANIFEST
        ) as keyof typeof seed.sourceFiles
      ]
    );
    assert.ok(
      seed.sourceFiles[journalPath(MANIFEST) as keyof typeof seed.sourceFiles]
    );
  });
});
