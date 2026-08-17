/**
 * Who is acting on `/api/protected/*`, and on whose behalf.
 *
 * The protected surface accepts two credentials, and they are not the same
 * kind of thing:
 *
 * - **`ADMIN_TOKEN`** is a root credential. It belongs to no organization, so
 *   it cannot *have* an active one — a token caller that wants to act on a
 *   tenant must name it (`organizationId` as a query param on organization-
 *   scoped routes). App-scoped routes address by app id alone. This is the
 *   ops/CI/verification path.
 * - **A session** belongs to a user, and in this product a user belongs to
 *   exactly one organization. It carries its own scope; letting it *also*
 *   name an organization would be handing a signed-in user a way to name
 *   someone else's.
 *
 * An explicit `organizationId` is always a query parameter — including on
 * `POST /api/protected/apps`. The dispatcher resolves it for `scope: "organization"`
 * routes (`handleListApps`, `handleCreateApp`) and puts the result on
 * `OrgCtx`. App-scoped routes never call the resolver: `requireAppAccess`
 * is the gate, and root may address them by app id alone.
 *
 * Note what is NOT here for live: `/a/:appId/*` is addressed by app id alone
 * and stays that way. That route serves a generated app to *its own* end
 * users, who are not factory users and have no factory organization —
 * scoping it by factory tenancy would be a category error. Its access
 * control is the app's own better-auth, and app ids are unguessable ULIDs
 * rather than names.
 *
 * PR previews (`/a/:appId/preview/:prNumber/*`) and workspace WIP
 * (`/a/:appId/workspace/*`) are different: they are factory org surfaces
 * and are gated with `resolveActor` + `requireAppAccess` in `hono/host.ts`
 * before serve.
 */
import { and, eq } from "drizzle-orm";
import { createAuth } from "../auth/server.js";
import type { Db } from "../db/index.js";
import { member } from "../db/schema.js";
import { appBelongsToOrganization } from "../registry/app-registry.js";

export type Actor =
  | { kind: "token" }
  | { kind: "session"; userId: string; organizationId: string };

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * Resolve the caller's credential, or return the 401 to send.
 *
 * **Stricter than the original gate on purpose.** The old gate returned "allowed"
 * whenever `ADMIN_TOKEN` was unset, so a factory deployed without that secret
 * left every admin route wide open — a missing secret should never be the
 * thing that grants access. Now a request with no usable credential is 401
 * whatever the config says, and local development sets `ADMIN_TOKEN` in
 * `.dev.vars` like any other secret.
 */
export async function resolveActor(
  env: Env,
  db: Db,
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

  // `activeOrganizationId` is a denormalised *hint on the session row*, not a
  // grant, and better-auth does not keep it in sync with membership:
  //
  // - `remove-member` deletes the `member` row and only clears the column when
  //   the remover happens to BE the removed user (`crud-members.mjs:203`).
  //   Remove anyone else and their live sessions keep pointing at the org.
  // - `leave-organization` clears it for the *current session token only*
  //   (`:414`), so a user signed in twice keeps the stale value on the other
  //   session.
  //
  // Authorizing off that column would therefore let a removed member keep
  // committing, reverting, and running SQL against the org's apps until their
  // cookie expired. `member` is the authority; the column only selects which
  // membership is active.
  const membership = await db.query.member.findFirst({
    where: and(
      eq(member.userId, session.user.id),
      eq(member.organizationId, organizationId)
    ),
    columns: { id: true },
  });
  if (!membership) {
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
 * `explicit` is whatever the caller named as a query param. A session that
 * names its *own* organization is fine — the UI may well send it — but one
 * that names a different organization is a scope violation stated out loud
 * rather than silently ignored.
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
 * Gate an app-scoped protected route (`/api/protected/apps/:id/…`).
 *
 * Returns the error to send, or `null` when the caller may proceed.
 *
 * A token caller is root and addresses the Durable Object directly, as it has always
 * done — no registry read, so the ops path costs nothing new. A session
 * caller is checked against the registry, because otherwise any signed-in
 * user could commit to, revert, or run SQL against **any** app by id: these
 * routes take an app id and nothing else, and the app id is the only thing
 * standing between two tenants.
 *
 * Uses `appBelongsToOrganization` rather than `getAppUnscoped` deliberately:
 * `getAppUnscoped` is a full registry read, and this check sits on the
 * attempt-polling path the UI hits every couple of seconds. An ownership test
 * must be one indexed read, not a status fetch.
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
