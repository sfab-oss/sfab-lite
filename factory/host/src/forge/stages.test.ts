import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detailWithCdStages, finishStages, stagesLogLine } from "./stages.ts";

describe("finishStages", () => {
  it("sets totalMs and ISO bounds from the elapsed window", () => {
    const stages = finishStages(1000, { buildMs: 12 }, 1450);
    assert.equal(stages.buildMs, 12);
    assert.equal(stages.totalMs, 450);
    assert.equal(stages.startedAt, new Date(1000).toISOString());
    assert.equal(stages.finishedAt, new Date(1450).toISOString());
    assert.equal("schemaMs" in stages, false);
    assert.equal("lintMs" in stages, false);
    assert.equal("checkMs" in stages, false);
  });

  it("keeps every completed CD stage on success", () => {
    const stages = finishStages(
      0,
      {
        buildMs: 200,
        checkAttempts: 1,
        schemaMs: 40,
        writeMs: 15,
      },
      13_335
    );
    assert.deepEqual(stages, {
      buildMs: 200,
      checkAttempts: 1,
      schemaMs: 40,
      writeMs: 15,
      totalMs: 13_335,
      startedAt: new Date(0).toISOString(),
      finishedAt: new Date(13_335).toISOString(),
    });
  });
});

describe("stagesLogLine", () => {
  it("emits a cd JSON object wrangler tail can pick up", () => {
    const stages = finishStages(0, { checkAttempts: 2 }, 20);
    const parsed = JSON.parse(
      stagesLogLine("cd", "app_1", { sha: "abc", ...stages })
    ) as {
      cd: string;
      appId: string;
      sha: string;
      checkAttempts: number;
      totalMs: number;
      startedAt: string;
      finishedAt: string;
    };
    assert.equal(parsed.cd, "stages");
    assert.equal(parsed.appId, "app_1");
    assert.equal(parsed.sha, "abc");
    assert.equal(parsed.checkAttempts, 2);
    assert.equal(parsed.totalMs, 20);
    assert.equal("buildMs" in parsed, false);
    assert.equal("lintMs" in parsed, false);
    assert.equal("checkMs" in parsed, false);
    assert.equal(typeof parsed.startedAt, "string");
    assert.equal(typeof parsed.finishedAt, "string");
  });

  it("emits a create JSON object wrangler tail can pick up", () => {
    const stages = finishStages(
      0,
      { ensureRepoMs: 10, commitTreeMs: 20, cdMs: 30, settleMs: 5 },
      65
    );
    const parsed = JSON.parse(stagesLogLine("create", "app_1", stages)) as {
      create: string;
      appId: string;
      ensureRepoMs: number;
      totalMs: number;
    };
    assert.equal(parsed.create, "stages");
    assert.equal(parsed.appId, "app_1");
    assert.equal(parsed.ensureRepoMs, 10);
    assert.equal(parsed.totalMs, 65);
  });
});

describe("detailWithCdStages", () => {
  it("merges stages onto an existing check-run detail", () => {
    const stages = finishStages(0, { schemaMs: 9 }, 9);
    const detail = detailWithCdStages(
      { error: "lint_failed", detail: { lintHttp: 200 } },
      stages
    );
    assert.equal(detail.error, "lint_failed");
    assert.deepEqual(detail.detail, { lintHttp: 200 });
    assert.deepEqual(detail.stages, stages);
  });

  it("leaves detail unchanged when stages were never started", () => {
    const original = { error: "tree_missing" };
    assert.equal(detailWithCdStages(original, undefined), original);
  });
});
