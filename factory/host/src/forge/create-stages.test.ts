import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStagesLogLine, finishCreateStages } from "./create-stages.ts";

describe("finishCreateStages", () => {
  it("sets totalMs and ISO bounds from the elapsed window", () => {
    const stages = finishCreateStages(1000, { ensureRepoMs: 12 }, 1450);
    assert.equal(stages.ensureRepoMs, 12);
    assert.equal(stages.totalMs, 450);
    assert.equal(stages.startedAt, new Date(1000).toISOString());
    assert.equal(stages.finishedAt, new Date(1450).toISOString());
    assert.equal("commitTreeMs" in stages, false);
  });
});

describe("createStagesLogLine", () => {
  it("is one JSON object wrangler tail can pick up", () => {
    const stages = finishCreateStages(
      0,
      { ensureRepoMs: 10, commitTreeMs: 20, cdMs: 30, settleMs: 5 },
      65
    );
    const parsed = JSON.parse(createStagesLogLine("app_1", stages)) as {
      create: string;
      appId: string;
      ensureRepoMs: number;
      commitTreeMs: number;
      cdMs: number;
      settleMs: number;
      totalMs: number;
      startedAt: string;
      finishedAt: string;
    };
    assert.equal(parsed.create, "stages");
    assert.equal(parsed.appId, "app_1");
    assert.equal(parsed.ensureRepoMs, 10);
    assert.equal(parsed.commitTreeMs, 20);
    assert.equal(parsed.cdMs, 30);
    assert.equal(parsed.settleMs, 5);
    assert.equal(parsed.totalMs, 65);
    assert.equal(typeof parsed.startedAt, "string");
    assert.equal(typeof parsed.finishedAt, "string");
  });
});
