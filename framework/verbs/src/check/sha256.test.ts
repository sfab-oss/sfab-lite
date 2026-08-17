import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256Utf8Hex } from "./sha256.ts";

test("sha256Utf8Hex matches FIPS 180-4 empty and abc vectors", () => {
  assert.equal(
    sha256Utf8Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  assert.equal(
    sha256Utf8Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("sha256Utf8Hex covers a two-block message", () => {
  const text = "a".repeat(64);
  assert.equal(
    sha256Utf8Hex(text),
    "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"
  );
});
