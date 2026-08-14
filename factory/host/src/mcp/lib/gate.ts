/**
 * Which credential a `/mcp` caller presented, decided before any verification
 * happens. Kept free of Worker-only imports so it can be exercised directly —
 * the tool modules reach `cloudflare:workers` through `agents`, which a plain
 * Node test cannot load.
 */

const BEARER_PREFIX = "Bearer ";

export type McpCredential =
  /** The shared admin secret, scoped by an explicit `?organizationId=`. */
  | { kind: "admin"; organizationId: string }
  /** An OAuth access token. The org comes from its grant, not the caller. */
  | { kind: "bearer"; token: string }
  | { kind: "reject"; status: 400 | 401; message: string };

function bearerValue(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return header.slice(BEARER_PREFIX.length).trim() || null;
}

/**
 * The org is not optional on the admin door: a token actor carries no session
 * and no grant, so the organization-scoped admin routes the tools reach would
 * have nothing to scope to. It is a bad request, not a refusal — the
 * credential was fine.
 */
function adminCredential(url: URL): McpCredential {
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return {
      kind: "reject",
      status: 400,
      message: "organizationId query parameter required",
    };
  }
  return { kind: "admin", organizationId };
}

/**
 * Read the presented credential.
 *
 * Two doors, and which one a caller took is unambiguous. `X-Admin-Token` is
 * only ever the shared secret, so a mismatch there is refused outright rather
 * than retried as a token. `Authorization: Bearer` is an OAuth access token
 * unless it is exactly the admin secret — the compare is a cheap equality on a
 * value the operator set, so it settles before anything reaches the JWKS.
 *
 * An unset `ADMIN_TOKEN` must never be the thing that grants access; the check
 * worker's gate makes the same correction.
 */
export function readMcpCredential(
  request: Request,
  url: URL,
  adminToken: string | undefined
): McpCredential {
  const presentedAdmin = request.headers.get("X-Admin-Token");
  if (presentedAdmin !== null) {
    return adminToken && presentedAdmin === adminToken
      ? adminCredential(url)
      : { kind: "reject", status: 401, message: "unauthorized" };
  }

  const bearer = bearerValue(request);
  if (bearer === null) {
    return {
      kind: "reject",
      status: 401,
      message: "missing bearer token",
    };
  }
  if (adminToken && bearer === adminToken) {
    return adminCredential(url);
  }
  return { kind: "bearer", token: bearer };
}

/**
 * RFC 6750 / RFC 9728: point a spec-compliant client at the protected-resource
 * metadata so a 401 is something it can recover from — discover the
 * authorization server, register, and come back with a token — rather than a
 * dead end.
 */
export function wwwAuthenticate(origin: string, errorCode: string): string {
  return `Bearer error="${errorCode}", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`;
}

export function mcpError(
  status: number,
  code: number,
  message: string,
  challenge?: string
): Response {
  return Response.json(
    { jsonrpc: "2.0" as const, error: { code, message }, id: null },
    {
      status,
      headers: challenge
        ? {
            "WWW-Authenticate": challenge,
            "Access-Control-Expose-Headers": "WWW-Authenticate",
          }
        : {},
    }
  );
}
