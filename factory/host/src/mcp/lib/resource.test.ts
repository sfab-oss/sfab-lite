import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMcpResource, mcpIssuer, mcpResource } from "./resource.ts";

const RESOURCE = "https://factory.test/mcp";

test("the audience and the issuer are not the same string", () => {
  assert.equal(mcpResource("https://factory.test"), RESOURCE);
  assert.equal(
    mcpIssuer("https://factory.test"),
    "https://factory.test/api/auth"
  );
});

/**
 * Without a `resource` the provider mints an opaque token the resource server
 * cannot verify against the JWKS, so every call 401s with nothing naming the
 * cause. This server protects exactly one resource, so filling it in is safe.
 */
test("a token request that omits the resource gets this server's", () => {
  assert.deepEqual(
    defaultMcpResource(
      "/oauth2/token",
      { grant_type: "authorization_code" },
      RESOURCE
    ),
    { grant_type: "authorization_code", resource: RESOURCE }
  );
});

test("a client's own resource is left alone for the provider to validate", () => {
  assert.equal(
    defaultMcpResource(
      "/oauth2/token",
      { resource: "https://elsewhere/mcp" },
      RESOURCE
    ),
    undefined
  );
});

test("an empty resource counts as absent", () => {
  assert.deepEqual(
    defaultMcpResource("/oauth2/token", { resource: "" }, RESOURCE),
    {
      resource: RESOURCE,
    }
  );
});

test("no other endpoint is touched", () => {
  assert.equal(
    defaultMcpResource("/oauth2/authorize", {}, RESOURCE),
    undefined
  );
  assert.equal(defaultMcpResource(undefined, {}, RESOURCE), undefined);
});

test("a body that is not an object is left alone", () => {
  assert.equal(defaultMcpResource("/oauth2/token", null, RESOURCE), undefined);
  assert.equal(
    defaultMcpResource("/oauth2/token", "grant_type=x", RESOURCE),
    undefined
  );
});
