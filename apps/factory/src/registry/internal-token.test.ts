import assert from "node:assert/strict";
import { test } from "node:test";
import { signAttemptRun, verifyAttemptRun } from "./internal-token.ts";

const SECRET = "test-secret-at-least-32-characters!!";
const APP = "app_01ABC";
const ATTEMPT = "a_01XYZ";

test("a signed token verifies for the pair it was minted for", async () => {
  const token = await signAttemptRun(SECRET, APP, ATTEMPT);
  assert.equal(await verifyAttemptRun(SECRET, APP, ATTEMPT, token), true);
});

test("a token does not carry to another app or attempt", async () => {
  const token = await signAttemptRun(SECRET, APP, ATTEMPT);
  assert.equal(
    await verifyAttemptRun(SECRET, "app_other", ATTEMPT, token),
    false
  );
  assert.equal(await verifyAttemptRun(SECRET, APP, "a_other", token), false);
});

test("another secret does not verify", async () => {
  const token = await signAttemptRun(SECRET, APP, ATTEMPT);
  assert.equal(
    await verifyAttemptRun(`${SECRET}x`, APP, ATTEMPT, token),
    false
  );
});

test("malformed tokens are refused rather than thrown at", async () => {
  for (const token of ["", "zz", "abc", "  ", "0x1234"]) {
    assert.equal(await verifyAttemptRun(SECRET, APP, ATTEMPT, token), false);
  }
});

test("the app/attempt boundary cannot be shifted", async () => {
  // Without the length prefix these two pairs sign identical bytes, and a
  // token for one would authorise the other.
  const left = await signAttemptRun(SECRET, "a:b", "c");
  const right = await signAttemptRun(SECRET, "a", "b:c");
  assert.notEqual(left, right);
});
