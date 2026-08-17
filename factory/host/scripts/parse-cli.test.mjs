import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCli } from "./parse-cli.mjs";

const options = {
  force: { type: "boolean", default: false },
  remote: { type: "boolean", default: false },
  local: { type: "boolean", default: false },
};

test("parseCli accepts pnpm's -- before --remote", () => {
  const { values } = parseCli(options, ["--", "--remote"]);
  assert.equal(values.remote, true);
  assert.equal(values.local, false);
  assert.equal(values.force, false);
});

test("parseCli still accepts a bare --remote", () => {
  const { values } = parseCli(options, ["--remote"]);
  assert.equal(values.remote, true);
});

test("parseCli defaults when argv is empty", () => {
  const { values } = parseCli(options, []);
  assert.equal(values.remote, false);
  assert.equal(values.local, false);
});
