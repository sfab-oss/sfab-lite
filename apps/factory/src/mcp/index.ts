import { createMcpHandler } from "agents/mcp";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import type { JSONWebKeySet } from "jose";
import { createAuth } from "../auth.js";
import type { RequestCtx } from "../routes.js";
import { buildMcpServer } from "./lib/build-server.js";
import { mcpError, readMcpCredential, wwwAuthenticate } from "./lib/gate.js";
import { resolveMcpGrant } from "./lib/grant.js";
import { mcpIssuer, mcpResource } from "./lib/resource.js";

/**
 * Stable object the verified key set is cached under — better-auth applies its
 * own TTL and kid-miss refetch rules against it. Module-scoped so the cache is
 * shared across requests in one isolate rather than rebuilt per call.
 */
const jwksCacheKey = {};

/**
 * Resolve the signing key set **in-process**.
 *
 * `verifyJwsAccessToken` also accepts a URL, which would make it fetch this
 * worker's own `/api/auth/jwks`. On Cloudflare that is a same-zone loopback
 * subrequest the runtime refuses, and it surfaces as a blanket 500 on every
 * MCP call rather than anything that names the cause. Reading the key set
 * through the jwt plugin's own endpoint avoids the round-trip entirely.
 */
function jwksSource(
  auth: ReturnType<typeof createAuth>
): () => Promise<JSONWebKeySet> {
  return async () => (await auth.api.getJwks()) as JSONWebKeySet;
}

/** The organization a verified bearer token may act in, or a refusal. */
async function organizationForBearer(
  rc: RequestCtx,
  token: string
): Promise<string | Response> {
  const auth = createAuth(rc.env, rc.url.origin);
  let payload: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: jwksSource(auth),
      jwksCacheKey,
      verifyOptions: {
        issuer: mcpIssuer(rc.url.origin),
        audience: mcpResource(rc.url.origin),
      },
    });
  } catch {
    return mcpError(
      401,
      -32_002,
      "invalid or expired access token",
      wwwAuthenticate(rc.url.origin, "invalid_token")
    );
  }

  const userId = payload.sub;
  // `verifyJwsAccessToken` mirrors `azp` onto `client_id` (RFC 7662 shape).
  const clientId = (payload.azp ?? payload.client_id) as string | undefined;
  if (!(userId && clientId)) {
    return mcpError(
      401,
      -32_002,
      "token missing required claims",
      wwwAuthenticate(rc.url.origin, "invalid_token")
    );
  }

  const grant = await resolveMcpGrant(rc.env, { clientId, userId });
  if (!grant) {
    return mcpError(
      403,
      -32_002,
      "this token has no organization binding, or the user is no longer a member of the bound organization — re-authorize to bind one",
      wwwAuthenticate(rc.url.origin, "insufficient_scope")
    );
  }
  return grant.organizationId;
}

/**
 * `/mcp` — the factory's tools with no model in the loop, so the create → edit
 * → check → deploy loop can be driven (and tested) directly.
 *
 * Two doors onto the same tools. An OAuth access token is the one any MCP
 * client can obtain on its own: it discovers this worker as an authorization
 * server, registers itself, sends its user through consent, and comes back
 * bound to the organization that consent chose. The shared `ADMIN_TOKEN` is
 * the machine door for callers that have no browser — CI, scripts — and grants
 * nothing the `/admin/*` API does not already grant that same token.
 *
 * The org is the one thing a caller never asserts on the OAuth path: it comes
 * from the grant row, re-checked against live membership on every request.
 */
export async function dispatchMcp(rc: RequestCtx): Promise<Response> {
  const credential = readMcpCredential(rc.request, rc.url, rc.env.ADMIN_TOKEN);
  if (credential.kind === "reject") {
    return mcpError(
      credential.status,
      credential.status === 401 ? -32_002 : -32_602,
      credential.message,
      credential.status === 401
        ? wwwAuthenticate(rc.url.origin, "invalid_token")
        : undefined
    );
  }

  let organizationId: string;
  if (credential.kind === "admin") {
    organizationId = credential.organizationId;
  } else {
    const resolved = await organizationForBearer(rc, credential.token);
    if (resolved instanceof Response) {
      return resolved;
    }
    organizationId = resolved;
  }

  const server = buildMcpServer({ env: rc.env, organizationId });
  return await createMcpHandler(server)(rc.request, rc.env, rc.ctx);
}
