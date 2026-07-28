/**
 * The `/mcp` credential decision, kept free of Worker-only imports so it can be
 * exercised directly — the tool modules reach `cloudflare:workers` through
 * `agents`, which a plain Node test cannot load.
 */

const BEARER_PREFIX = "Bearer ";

/** MCP clients send `Authorization: Bearer`; the factory's own callers send `X-Admin-Token`. */
function presentedToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header?.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length).trim() || null;
  }
  return request.headers.get("X-Admin-Token");
}

function rpcError(status: number, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0" as const, error: { code, message } },
    {
      status,
      ...(status === 401
        ? { headers: { "WWW-Authenticate": 'Bearer realm="sfab-lite"' } }
        : {}),
    }
  );
}

/**
 * Authorize a `/mcp` request, yielding the organization every org-scoped admin
 * route needs. An unset `ADMIN_TOKEN` must never be the thing that grants
 * access — the check worker's gate makes the same correction.
 */
export function authorizeMcp(
  request: Request,
  url: URL,
  adminToken: string | undefined
): { organizationId: string } | Response {
  if (!adminToken) {
    return rpcError(401, -32_001, "admin_token_not_configured");
  }
  if (presentedToken(request) !== adminToken) {
    return rpcError(401, -32_001, "unauthorized");
  }
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return rpcError(400, -32_602, "organizationId query parameter required");
  }
  return { organizationId };
}
