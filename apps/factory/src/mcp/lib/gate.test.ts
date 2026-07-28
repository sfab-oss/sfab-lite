import assert from "node:assert/strict";
import { test } from "node:test";
import { readMcpCredential, wwwAuthenticate } from "./gate.ts";

const TOKEN = "admin-token-value";
const WITH_ORG = "https://factory.test/mcp?organizationId=org_1";
const NO_ORG = "https://factory.test/mcp";

function credential(
  headers: Record<string, string>,
  adminToken: string | undefined = TOKEN,
  href = WITH_ORG
) {
  return readMcpCredential(
    new Request(href, { method: "POST", headers }),
    new URL(href),
    adminToken
  );
}

test("an unset ADMIN_TOKEN refuses the admin door rather than opening it", () => {
  assert.deepEqual(credential({ "X-Admin-Token": "anything" }, undefined), {
    kind: "reject",
    status: 401,
    message: "unauthorized",
  });
});

test("a wrong X-Admin-Token is refused outright, not retried as a token", () => {
  const out = credential({ "X-Admin-Token": "nope" });
  assert.equal(out.kind, "reject");
});

test("no credential at all is refused", () => {
  assert.deepEqual(credential({}), {
    kind: "reject",
    status: 401,
    message: "missing bearer token",
  });
});

test("the factory's own X-Admin-Token header opens the admin door", () => {
  assert.deepEqual(credential({ "X-Admin-Token": TOKEN }), {
    kind: "admin",
    organizationId: "org_1",
  });
});

test("the admin token presented as a bearer is still the admin door", () => {
  assert.deepEqual(credential({ Authorization: `Bearer ${TOKEN}` }), {
    kind: "admin",
    organizationId: "org_1",
  });
});

/**
 * The org is not optional on the admin door: a token actor carries no session
 * and no grant, so the org-scoped admin routes the tools reach would have
 * nothing to scope to. A bad request, not a refusal — the credential was fine.
 */
test("the admin door without an organization is a bad request", () => {
  const out = credential({ "X-Admin-Token": TOKEN }, TOKEN, NO_ORG);
  assert.deepEqual(out, {
    kind: "reject",
    status: 400,
    message: "organizationId query parameter required",
  });
});

test("any other bearer value is treated as an access token to verify", () => {
  assert.deepEqual(credential({ Authorization: "Bearer eyJhbGci.abc.def" }), {
    kind: "bearer",
    token: "eyJhbGci.abc.def",
  });
});

/**
 * An OAuth client never sends `?organizationId=` — its org comes from the
 * grant. Requiring one here would break every spec-compliant client.
 */
test("a bearer token needs no organization query parameter", () => {
  assert.deepEqual(
    credential({ Authorization: "Bearer eyJhbGci.abc.def" }, TOKEN, NO_ORG),
    { kind: "bearer", token: "eyJhbGci.abc.def" }
  );
});

test("an empty bearer value is no credential at all", () => {
  const out = credential({ Authorization: "Bearer   " });
  assert.equal(out.kind, "reject");
});

test("an unconfigured factory still reads a bearer as a token", () => {
  assert.deepEqual(credential({ Authorization: "Bearer abc" }, undefined), {
    kind: "bearer",
    token: "abc",
  });
});

/**
 * A 401 a client cannot act on is a dead end. The challenge is what turns one
 * into "discover the authorization server, register, come back with a token".
 */
test("the challenge names the protected-resource metadata", () => {
  const challenge = wwwAuthenticate("https://factory.test", "invalid_token");
  assert.ok(challenge.startsWith("Bearer "));
  assert.ok(
    challenge.includes(
      'resource_metadata="https://factory.test/.well-known/oauth-protected-resource/mcp"'
    )
  );
});
