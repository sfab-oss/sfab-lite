import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecipeName } from "./lite.ts";

const BARE_NAME = /bare names are a hard error/;
const SHADCN_HOST = /ui\.shadcn\.com/;

test("lite/slug names parse", () => {
  assert.equal(parseRecipeName("lite/button").ok, true);
  assert.equal(parseRecipeName("lite/party-form").ok, true);
  assert.equal(parseRecipeName("lite/parties/party-form").ok, true);
});

test("bare names hard-error before any lookup", () => {
  const result = parseRecipeName("button");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, BARE_NAME);
    assert.match(result.error, SHADCN_HOST);
  }
});

test("urls and foreign namespaces never resolve", () => {
  assert.equal(
    parseRecipeName("https://ui.shadcn.com/r/button.json").ok,
    false
  );
  assert.equal(parseRecipeName("@shadcn/button").ok, false);
});
