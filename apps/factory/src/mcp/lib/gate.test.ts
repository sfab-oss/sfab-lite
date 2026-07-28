import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeMcp } from "./gate.ts";

const TOKEN = "admin-token-value";
const WITH_ORG = "https://factory.test/mcp?organizationId=org_1";
const NO_ORG = "https://factory.test/mcp";

function attempt(
  headers: Record<string, string>,
  adminToken: string | undefined = TOKEN,
  href = WITH_ORG
) {
  return authorizeMcp(
    new Request(href, { method: "POST", headers }),
    new URL(href),
    adminToken
  );
}

test("an unset ADMIN_TOKEN refuses rather than admits", () => {
  const out = attempt({ Authorization: "Bearer anything" }, undefined);
  assert.ok(out instanceof Response);
  assert.equal(out.status, 401);
});

test("a wrong token is refused", () => {
  const out = attempt({ Authorization: "Bearer nope" });
  assert.ok(out instanceof Response);
  assert.equal(out.status, 401);
});

test("no credential at all is refused", () => {
  const out = attempt({});
  assert.ok(out instanceof Response);
  assert.equal(out.status, 401);
});

test("a refusal tells a spec-compliant client how to authenticate", () => {
  const out = attempt({});
  assert.ok(out instanceof Response);
  assert.ok(out.headers.get("WWW-Authenticate")?.startsWith("Bearer"));
});

test("a bearer token is accepted", () => {
  assert.deepEqual(attempt({ Authorization: `Bearer ${TOKEN}` }), {
    organizationId: "org_1",
  });
});

test("the factory's own X-Admin-Token header is accepted too", () => {
  assert.deepEqual(attempt({ "X-Admin-Token": TOKEN }), {
    organizationId: "org_1",
  });
});

/**
 * The org is not optional: a token actor carries no session, so the
 * organization-scoped admin routes the tools reach would have nothing to scope
 * to. It is a bad request, not a refusal — the credential was fine.
 */
test("a good token without an organization is a bad request", () => {
  const out = attempt({ Authorization: `Bearer ${TOKEN}` }, TOKEN, NO_ORG);
  assert.ok(out instanceof Response);
  assert.equal(out.status, 400);
  assert.equal(out.headers.get("WWW-Authenticate"), null);
});

test("an empty bearer value does not pass as a token", () => {
  const out = attempt({ Authorization: "Bearer   " });
  assert.ok(out instanceof Response);
  assert.equal(out.status, 401);
});
