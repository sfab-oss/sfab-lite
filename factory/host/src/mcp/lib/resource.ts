/**
 * The RFC 8707 resource identifier this factory protects, and the one place
 * that decides it. Kept free of Worker-only imports so both the auth config
 * and the `/mcp` gate can agree on the audience without either importing the
 * other.
 */
export function mcpResource(baseURL: string): string {
  return `${baseURL}/mcp`;
}

/** The `iss` the OAuth provider signs with — `baseURL` + better-auth's basePath. */
export function mcpIssuer(baseURL: string): string {
  return `${baseURL}/api/auth`;
}

/**
 * Supply the `resource` on token requests that omit it.
 *
 * The provider mints a **JWT** access token only when the token request carries
 * an RFC 8707 `resource`; without one it issues an opaque token, which the
 * resource server cannot verify against the JWKS — every `/mcp` call would 401
 * with no hint as to why. This server protects exactly one resource, so a
 * missing `resource` is unambiguous and we fill it in.
 *
 * A client-supplied value is left alone: the provider still validates it
 * against `validAudiences` and rejects anything else.
 *
 * Returns the patched body to merge into the request, or `undefined` to leave
 * it untouched.
 */
export function defaultMcpResource(
  path: string | undefined,
  body: unknown,
  resource: string
): Record<string, unknown> | undefined {
  if (path !== "/oauth2/token") {
    return;
  }
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.resource === "string" && record.resource.length > 0) {
    return;
  }
  return { ...record, resource };
}
