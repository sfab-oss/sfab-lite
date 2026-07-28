import { z } from "zod";
import { createAuth, factoryTrustedOrigins } from "../auth.js";
import type { RouteCtx } from "../routes.js";
import { consentOriginAllowed } from "./lib/consent-origin.js";
import {
  isOrganizationMember,
  oauthClientExists,
  organizationsForUser,
  upsertMcpOrganizationGrant,
} from "./lib/grant.js";

const consentBody = z.object({
  /**
   * The entire signed authorization query the provider redirected the browser
   * with — `client_id`, `redirect_uri`, `code_challenge`, `state`, `exp`, `sig`
   * and the rest, verbatim. The signature is over the whole string, so it is
   * submitted back untouched rather than reassembled from parts.
   */
  oauth_query: z.string().min(1),
  organizationId: z.string().min(1),
  accept: z.boolean(),
});

async function sessionUser(rc: RouteCtx) {
  const auth = createAuth(rc.env, rc.url.origin);
  const session = await auth.api.getSession({ headers: rc.request.headers });
  return session?.user ?? null;
}

/**
 * What the consent screen needs to render: who is signed in, and which
 * organizations they could bind the client to.
 *
 * A dedicated read rather than the org plugin's client-side list: the page has
 * to answer "is anyone signed in *and* what may they choose" in one shot,
 * before it can decide between the sign-in view and the consent view.
 */
export async function handleMcpConsentContext(rc: RouteCtx): Promise<Response> {
  const user = await sessionUser(rc);
  if (!user) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }
  return Response.json({
    user: { name: user.name, email: user.email },
    organizations: await organizationsForUser(rc.env, user.id),
  });
}

/**
 * Translate better-auth's thrown `APIError` into a real client response.
 *
 * The plugin throws rather than returns on a bad signature, an expired signed
 * query, a scope that was not in the original request, or a failure to mint the
 * code. Left alone each of those becomes an opaque 500 with nothing naming the
 * cause, which is precisely the failure that is hardest to debug from the
 * client side of an OAuth redirect.
 *
 * The whole request is forwarded, not just its headers: after verifying the
 * signature `oauth2Consent` re-dispatches internally to the authorize endpoint,
 * which fails with "request not found" when `ctx.request` is absent. Passing a
 * request would also flip the call to return a `Response`, so `asResponse` is
 * pinned false to keep the `{ redirect, url }` payload. `headers` is still
 * passed explicitly — dispatch does not derive it from `request`, and the
 * session middleware needs it to find the cookie.
 */
async function runConsent(
  rc: RouteCtx,
  oauthQuery: string,
  accept: boolean
): Promise<{ ok: true; payload: unknown } | { ok: false; response: Response }> {
  const auth = createAuth(rc.env, rc.url.origin);
  try {
    const payload = await auth.api.oauth2Consent({
      body: { accept, oauth_query: oauthQuery },
      headers: rc.request.headers,
      request: rc.request,
      asResponse: false,
    });
    return { ok: true, payload };
  } catch (err) {
    const apiErr = err as {
      statusCode?: number;
      body?: { error?: string; error_description?: string; message?: string };
      message?: string;
    };
    const detail =
      apiErr.body?.error_description ??
      apiErr.body?.error ??
      apiErr.body?.message ??
      apiErr.message ??
      "consent failed";
    return {
      ok: false,
      response: Response.json(
        { error: detail },
        { status: apiErr.statusCode ?? 400 }
      ),
    };
  }
}

/**
 * The consent POST — the one request that turns a signed authorization query
 * into a code the client can exchange, and the only place an organization
 * binding is written.
 *
 * `client_id` is read from the signed query rather than the request body, so a
 * caller cannot write a grant for a client other than the one being authorized.
 */
export async function handleMcpConsent(rc: RouteCtx): Promise<Response> {
  if (
    !consentOriginAllowed(
      rc.request,
      factoryTrustedOrigins(rc.env, rc.url.origin)
    )
  ) {
    return Response.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const user = await sessionUser(rc);
  if (!user) {
    return Response.json({ error: "not_signed_in" }, { status: 401 });
  }

  const parsed = consentBody.safeParse(
    await rc.request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid_request_body" }, { status: 400 });
  }
  const body = parsed.data;

  const clientId = new URLSearchParams(body.oauth_query).get("client_id");
  if (!clientId) {
    return Response.json({ error: "missing_client_id" }, { status: 400 });
  }

  // Denial writes no grant and checks no membership — the provider answers the
  // client with an `access_denied` redirect and the flow ends there.
  if (!body.accept) {
    const denied = await runConsent(rc, body.oauth_query, false);
    return denied.ok ? Response.json(denied.payload) : denied.response;
  }

  if (
    !(await isOrganizationMember(rc.env, {
      userId: user.id,
      organizationId: body.organizationId,
    }))
  ) {
    return Response.json({ error: "not_a_member" }, { status: 403 });
  }
  if (!(await oauthClientExists(rc.env, clientId))) {
    return Response.json({ error: "unknown_client" }, { status: 400 });
  }

  const accepted = await runConsent(rc, body.oauth_query, true);
  if (!accepted.ok) {
    return accepted.response;
  }

  await upsertMcpOrganizationGrant(rc.env, {
    clientId,
    userId: user.id,
    organizationId: body.organizationId,
  });

  return Response.json(accepted.payload);
}
