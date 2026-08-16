import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cdStagesLogLine,
  detailWithCdStages,
  finishCdStages,
} from "./cd-stages.ts";

describe("finishCdStages", () => {
  it("sets totalMs from the elapsed window and keeps later stages absent", () => {
    const stages = finishCdStages(1000, { lintMs: 12 }, 1450);
    assert.equal(stages.lintMs, 12);
    assert.equal(stages.totalMs, 450);
    assert.equal("buildMs" in stages, false);
    assert.equal("checkMs" in stages, false);
    assert.equal("schemaMs" in stages, false);
    assert.equal("writeMs" in stages, false);
  });

  it("keeps every completed stage on success", () => {
    const stages = finishCdStages(
      0,
      {
        lintMs: 80,
        buildMs: 200,
        checkMs: 13_000,
        checkAttempts: 1,
        schemaMs: 40,
        writeMs: 15,
      },
      13_335
    );
    assert.deepEqual(stages, {
      lintMs: 80,
      buildMs: 200,
      checkMs: 13_000,
      checkAttempts: 1,
      schemaMs: 40,
      writeMs: 15,
      totalMs: 13_335,
    });
  });
});

describe("cdStagesLogLine", () => {
  it("is one JSON object wrangler tail can pick up", () => {
    const stages = finishCdStages(0, { lintMs: 10, checkAttempts: 2 }, 20);
    const parsed = JSON.parse(cdStagesLogLine("app_1", "abc", stages)) as {
      cd: string;
      appId: string;
      sha: string;
      lintMs: number;
      checkAttempts: number;
      totalMs: number;
    };
    assert.equal(parsed.cd, "stages");
    assert.equal(parsed.appId, "app_1");
    assert.equal(parsed.sha, "abc");
    assert.equal(parsed.lintMs, 10);
    assert.equal(parsed.checkAttempts, 2);
    assert.equal(parsed.totalMs, 20);
    assert.equal("buildMs" in parsed, false);
  });
});

describe("detailWithCdStages", () => {
  it("merges stages onto an existing check-run detail", () => {
    const detail = detailWithCdStages(
      { error: "lint_failed", detail: { lintHttp: 200 } },
      finishCdStages(0, { lintMs: 9 }, 9)
    );
    assert.equal(detail.error, "lint_failed");
    assert.deepEqual(detail.detail, { lintHttp: 200 });
    assert.deepEqual(detail.stages, { lintMs: 9, totalMs: 9 });
  });

  it("leaves detail unchanged when stages were never started", () => {
    const original = { error: "tree_missing" };
    assert.equal(detailWithCdStages(original, undefined), original);
  });
});
