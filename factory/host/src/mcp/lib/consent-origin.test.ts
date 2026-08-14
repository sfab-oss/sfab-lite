import assert from "node:assert/strict";
import { test } from "node:test";
import { consentOriginAllowed } from "./consent-origin.ts";

const TRUSTED = ["https://factory.test", "http://localhost:5173"];

function post(headers: Record<string, string>) {
  return new Request("https://factory.test/api/mcp/consent", {
    method: "POST",
    headers,
  });
}

test("a same-origin post is allowed", () => {
  assert.equal(
    consentOriginAllowed(post({ Origin: "https://factory.test" }), TRUSTED),
    true
  );
});

test("the vite dev origin is allowed when configured", () => {
  assert.equal(
    consentOriginAllowed(post({ Origin: "http://localhost:5173" }), TRUSTED),
    true
  );
});

test("another site's post is refused", () => {
  assert.equal(
    consentOriginAllowed(post({ Origin: "https://evil.test" }), TRUSTED),
    false
  );
});

/**
 * Absent `Origin` is the case worth being explicit about: a same-origin form
 * post always carries one or a `Referer`, so nothing at all is a request no
 * browser on this factory made.
 */
test("no origin and no referer is refused", () => {
  assert.equal(consentOriginAllowed(post({}), TRUSTED), false);
});

test("referer stands in when origin is absent", () => {
  assert.equal(
    consentOriginAllowed(
      post({ Referer: "https://factory.test/mcp/consent?sig=x" }),
      TRUSTED
    ),
    true
  );
});

test("an unparseable origin is refused, not ignored", () => {
  assert.equal(
    consentOriginAllowed(post({ Origin: "not a url" }), TRUSTED),
    false
  );
});

test("an empty trust list refuses everything", () => {
  assert.equal(
    consentOriginAllowed(post({ Origin: "https://factory.test" }), []),
    false
  );
});
