/**
 * Who is acting on `/admin/*`, and on whose behalf.
 *
 * The admin surface accepts two credentials, and they are not the same kind
 * of thing:
 *
 * - **`ADMIN_TOKEN`** is a root credential. It belongs to no organization, so
 *   it cannot *have* an active one — a token caller that wants to act on a
 *   tenant must name it (`organizationId` in the body or query, exactly as
 *   before S3c). This is the ops/CI/verification path and its behaviour is
 *   deliberately unchanged.
 * - **A session** belongs to a user, and in this product a user belongs to
 *   exactly one organization. It carries its own scope; letting it *also*
 *   name an organization would be handing a signed-in user a way to name
 *   someone else's.
 *
 * Everything downstream consumes a resolved organization id, never the
 * credential itself, so the handlers keep one code path.
 *
 * Note what is NOT here: `/a/:appId/*` is addressed by app id alone and stays
 * that way. That route serves a generated app to *its own* end users, who are
 * not factory users and have no factory organization — scoping it by factory
 * tenancy would be a category error. Its access control is the app's own
 * better-auth, and app ids are unguessable ULIDs rather than names.
 */
import { createAuth } from "./auth.js";
import type { Db } from "./db/index.js";
import { appBelongsToOrganization } from "./registry.js";

export type Actor =
  | { kind: "token" }
  | { kind: "session"; userId: string; organizationId: string };

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * Resolve the caller's credential, or return the 401 to send.
 *
 * **Stricter than before S3c on purpose.** The old gate returned "allowed"
 * whenever `ADMIN_TOKEN` was unset, so a factory deployed without that secret
 * left every admin route wide open — a missing secret should never be the
 * thing that grants access. Now a request with no usable credential is 401
 * whatever the config says, and local development sets `ADMIN_TOKEN` in
 * `.dev.vars` like any other secret.
 */
export async function resolveActor(
  env: Env,
  request: Request,
  origin: string
): Promise<Actor | Response> {
  const token = request.headers.get("X-Admin-Token");
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
    return { kind: "token" };
  }

  const session = await createAuth(env, origin)
    .api.getSession({ headers: request.headers })
    .catch(() => null);
  const organizationId = session?.session.activeOrganizationId;
  if (!(session && organizationId)) {
    // A session without an active organization cannot be scoped, and this
    // product has no org-less state a user could legitimately act from —
    // `user.create.after` provisions one at sign-up. Treat it as no
    // credential rather than inventing a tenant for it.
    return unauthorized();
  }

  return {
    kind: "session",
    userId: session.user.id,
    organizationId,
  };
}

/**
 * The organization this request acts on, or the error to send.
 *
 * `explicit` is whatever the caller named (body field or query param). A
 * session that names its *own* organization is fine — the UI may well send
 * it — but one that names a different organization is a scope violation
 * stated out loud rather than silently ignored.
 */
export function resolveOrganization(
  actor: Actor,
  explicit: string | undefined
): { organizationId: string } | Response {
  const named = explicit?.trim() || undefined;

  if (actor.kind === "token") {
    if (!named) {
      return Response.json(
        { ok: false, error: "organizationId required" },
        { status: 400 }
      );
    }
    return { organizationId: named };
  }

  if (named && named !== actor.organizationId) {
    return Response.json(
      { ok: false, error: "organization_forbidden" },
      { status: 403 }
    );
  }
  return { organizationId: actor.organizationId };
}

/**
 * Gate an app-scoped admin route (`/admin/apps/:id/…`).
 *
 * Returns the error to send, or `null` when the caller may proceed.
 *
 * A token caller is root and addresses the Durable Object directly, as it did
 * before S3c — no registry read, so the ops path costs nothing new. A session
 * caller is checked against the registry, because otherwise any signed-in
 * user could commit to, revert, or run SQL against **any** app by id: these
 * routes take an app id and nothing else, and the app id is the only thing
 * standing between two tenants.
 *
 * Uses `appBelongsToOrganization` rather than `getApp` deliberately: `getApp`
 * runs the stale-`creating` sweep, and this check sits on the attempt-polling
 * path the UI hits every couple of seconds. An ownership test must be one
 * indexed read, not a reconciliation pass.
 */
export async function requireAppAccess(
  db: Db,
  actor: Actor,
  appId: string
): Promise<Response | null> {
  if (actor.kind === "token") {
    return null;
  }
  const owned = await appBelongsToOrganization(db, actor.organizationId, appId);
  if (owned) {
    return null;
  }
  // Same answer for "no such app" and "not your app" — a distinct 403 would
  // confirm the existence of another tenant's app to anyone guessing ids.
  return Response.json({ ok: false, error: "app_not_found" }, { status: 404 });
}
