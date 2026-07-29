import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCheckRuns,
  formatPrList,
  formatPrView,
  parseGhArgs,
} from "./agent/gh-cli-text.ts";
import { parsePushArgs } from "./agent/git-push-args.ts";
import {
  type CheckRunRecord,
  type PrRecord,
  wireCheckRun,
  wirePr,
} from "./forge-wire.ts";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function samplePr(overrides: Partial<PrRecord> = {}): PrRecord {
  return {
    id: "pr_01",
    appId: "app_1",
    number: 3,
    title: "Add widgets",
    body: "Ship widgets",
    headBranch: "feat/widgets",
    baseBranch: "main",
    headSha: "abcdef0123456789",
    status: "open",
    previewSha: "abcdef0123456789",
    mergedSha: null,
    mergedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function sampleRun(overrides: Partial<CheckRunRecord> = {}): CheckRunRecord {
  return {
    id: "run_01",
    appId: "app_1",
    prId: "pr_01",
    sha: "abcdef0123456789",
    name: "cd",
    status: "completed",
    conclusion: "success",
    detail: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    ...overrides,
  };
}

describe("wirePr", () => {
  it("serializes dates to ISO and keeps nullables", () => {
    const wired = wirePr(samplePr());
    assert.equal(wired.number, 3);
    assert.equal(wired.mergedAt, null);
    assert.equal(wired.createdAt, NOW.toISOString());
    assert.equal(wired.previewSha, "abcdef0123456789");
  });
});

describe("wireCheckRun", () => {
  it("serializes completedAt", () => {
    const wired = wireCheckRun(sampleRun());
    assert.equal(wired.status, "completed");
    assert.equal(wired.conclusion, "success");
    assert.equal(wired.completedAt, NOW.toISOString());
  });
});

describe("parseGhArgs", () => {
  it("parses pr and run groups", () => {
    assert.deepEqual(parseGhArgs(["pr", "list"]), {
      ok: true,
      group: "pr",
      action: "list",
      rest: [],
    });
    assert.deepEqual(parseGhArgs(["run", "view", "run_1"]), {
      ok: true,
      group: "run",
      action: "view",
      rest: ["run_1"],
    });
  });

  it("rejects unknown groups and missing actions", () => {
    assert.equal(parseGhArgs([]).ok, false);
    assert.equal(parseGhArgs(["issue"]).ok, false);
    assert.equal(parseGhArgs(["pr"]).ok, false);
  });
});

describe("gh format helpers", () => {
  it("formats an empty PR list", () => {
    assert.equal(formatPrList([]), "no pull requests\n");
  });

  it("formats PR view with body", () => {
    const text = formatPrView(samplePr());
    assert.ok(text.includes("title:\tAdd widgets"));
    assert.ok(text.includes("head:\tfeat/widgets"));
    assert.ok(text.includes("Ship widgets"));
  });

  it("formats check runs table", () => {
    const text = formatCheckRuns([sampleRun()]);
    assert.ok(text.includes("run_01"));
    assert.ok(text.includes("success"));
  });
});

describe("parsePushArgs", () => {
  it("defaults bare push to main", () => {
    assert.deepEqual(parsePushArgs([]), {
      ok: true,
      remote: null,
      branch: "main",
    });
  });

  it("parses feature branch refspecs", () => {
    assert.deepEqual(parsePushArgs(["origin", "feat/x"]), {
      ok: true,
      remote: "origin",
      branch: "feat/x",
    });
    assert.deepEqual(parsePushArgs(["origin", "HEAD:feat/x"]), {
      ok: true,
      remote: "origin",
      branch: "feat/x",
    });
  });
});
