import { authClient } from "@/auth/client";

/**
 * End a session `/api/protected/*` will not accept, then let the UI fall back to
 * sign-in.
 *
 * A 401 from the protected API does **not** imply the session cookie is invalid.
 * `tenancy.ts` rejects a session whose organization it cannot confirm — a
 * stale `activeOrganizationId`, or a `member` row removed since sign-in — and
 * better-auth keeps reporting a signed-in user throughout.
 *
 * Navigating to sign-in without ending that session bounces forever: the
 * sign-in screen sends any signed-in user back to the console, the console
 * calls the protected API, and the API returns 401 again. Signing out is what
 * makes signed-out a state the UI can rest in.
 *
 * Never rejects — a failed sign-out must not replace the original error.
 */
export async function endUnusableSession(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
}
