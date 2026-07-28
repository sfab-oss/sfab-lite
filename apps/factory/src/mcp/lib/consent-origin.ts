/**
 * CSRF guard for the consent POST — accept only requests a browser on this
 * factory could have sent.
 *
 * better-auth applies its own origin check to `/api/auth/*`; the consent route
 * is ours, so without this the one request that mints an authorization code
 * would be the only unprotected state change in the flow.
 *
 * `Origin` is the signal; `Referer` is the fallback for the browsers that omit
 * it. Neither present is a refusal, not a pass — a same-origin form post always
 * carries at least one.
 */
export function consentOriginAllowed(
  request: Request,
  trustedOrigins: readonly string[]
): boolean {
  const allowed = new Set<string>();
  for (const entry of trustedOrigins) {
    try {
      allowed.add(new URL(entry).origin);
    } catch {
      // A malformed configured origin is not a reason to trust anything.
    }
  }
  if (allowed.size === 0) {
    return false;
  }

  const claimed =
    request.headers.get("Origin") ?? request.headers.get("Referer");
  if (!claimed) {
    return false;
  }
  try {
    return allowed.has(new URL(claimed).origin);
  } catch {
    return false;
  }
}
