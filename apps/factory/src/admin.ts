/**
 * `/admin/*` surface for the factory host worker.
 *
 * Owns every admin handler, the ADMIN_ROUTES table, and dispatchAdmin.
 * Credential resolution and app-ownership checks run in the dispatcher
 * before a handler sees the request.
 */
import { mergeSources } from "@sfab-lite/core";
import { APP_NAME_MAX_LENGTH, pickAppName } from "./app-names.js";
import {
  githubAuthEnabled,
  githubSecretsPresent,
  passwordAuthEnabled,
  signUpAllowlist,
  signUpOpen,
} from "./auth.js";
import {
  appStub,
  attemptAccepted,
  attemptConflict,
  attemptResolver,
  callCheck,
  checkPasses,
  enqueueCommit,
} from "./commit.js";
import { createDb } from "./db/index.js";
import TEMPLATE_SEED from "./generated/seed.json" with { type: "json" };
import {
  deleteAppUnscoped,
  getAppUnscoped,
  insertCreatingApp,
  listAppNamesForOrganization,
  listAppsForOrganization,
  markCreateFailed,
  organizationExists,
  renameAppUnscoped,
  setCreateAttemptId,
} from "./registry.js";
import type {
  AdminCtx,
  AdminRoute,
  AppCtx,
  OrgCtx,
  RequestCtx,
} from "./routes.js";
import { jsonError, matchRoute, NOT_FOUND_BODY } from "./routes.js";
import type { ScopedSqlProps } from "./scoped-sql.js";
import {
  requireAppAccess,
  resolveActor,
  resolveOrganization,
} from "./tenancy.js";

/** ctx.exports typing for WorkerEntrypoint classes isn't inferred by tsc alone. */
interface HostExports {
  ScopedSql: (opts: { props: ScopedSqlProps }) => {
    prepare: (query: string) => {
      bind: (...values: unknown[]) => {
        all: () => Promise<{
          success: true;
          results: Record<string, unknown>[];
          meta: unknown;
        }>;
      };
      all: () => Promise<{
        success: true;
        results: Record<string, unknown>[];
        meta: unknown;
      }>;
    };
    pingScope: () => Promise<{
      appId: string;
      ok: true;
      backend: "do-sqlite";
    }>;
  };
}

function scopedDb(ctx: ExecutionContext, appId: string) {
  const ex = ctx.exports as unknown as HostExports;
  return ex.ScopedSql({ props: { appId } satisfies ScopedSqlProps });
}

const RE_ADMIN_TOUCH = /^\/admin\/apps\/([^/]+)\/touch$/;
const RE_ADMIN_SQL = /^\/admin\/apps\/([^/]+)\/sql$/;
const RE_ADMIN_VERSIONS = /^\/admin\/apps\/([^/]+)\/versions$/;
const RE_ADMIN_LIVE = /^\/admin\/apps\/([^/]+)\/live$/;
const RE_ADMIN_ATTEMPTS = /^\/admin\/apps\/([^/]+)\/attempts$/;
const RE_ADMIN_ATTEMPT = /^\/admin\/apps\/([^/]+)\/attempts\/([^/]+)$/;
const RE_ADMIN_CHECK = /^\/admin\/apps\/([^/]+)\/check$/;
const RE_ADMIN_COMMIT = /^\/admin\/apps\/([^/]+)\/commit$/;
const RE_ADMIN_REVERT = /^\/admin\/apps\/([^/]+)\/revert$/;
const RE_ADMIN_APP = /^\/admin\/apps\/([^/]+)$/;

/**
 * Create an app: D1 row first (`creating`), then bootstrap + async seed.
 *
 * App ids are server-minted (`app_…`). The old caller-supplied id path also
 * returned `alreadySeeded: true` on collision — with owning organizations that
 * was a tenancy hole (silently attach to whoever already held the name). Gone.
 *
 * The owning organization comes from the dispatcher: a session acts
 * on its own, a token must name one via `?organizationId=`. The body carries
 * only `name`. `registry.ts` was written to take the org as an argument and
 * needed no change.
 *
 * `name` is optional: the console does not have one to send, because the app
 * is created from a prompt describing what to build rather than what to call
 * it. Omitting it draws a placeholder from `app-names.ts`.
 */
async function handleCreateApp(rc: OrgCtx): Promise<Response> {
  const body = (await rc.request.json().catch(() => null)) as {
    organizationId?: unknown;
    name?: string;
  } | null;
  // Body `organizationId` moved to `?organizationId=`. Reject the
  // legacy field so a session cannot silently ignore a named-other-org and a
  // token/session do not disagree on the same request shape.
  if (body != null && Object.hasOwn(body, "organizationId")) {
    return jsonError("organizationId_must_be_query_param");
  }
  const { organizationId } = rc;
  const requested = body?.name?.trim();
  if (requested && requested.length > APP_NAME_MAX_LENGTH) {
    return jsonError("name_too_long");
  }

  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return jsonError("organization_not_found", 404);
  }

  const name =
    requested ||
    pickAppName(await listAppNamesForOrganization(db, organizationId));

  // Row before DO work: the UI needs something to poll during the ~18–25s seed.
  const created = await insertCreatingApp(db, { organizationId, name });
  const appId = created.id;
  const stub = appStub(rc.env, appId);

  try {
    await stub.bootstrap(TEMPLATE_SEED.migrations);
  } catch (e) {
    await markCreateFailed(db, appId);
    return jsonError(e instanceof Error ? e.message : "bootstrap_failed", 500);
  }

  // Creation *is* a commit — same gate, same 202 — but the registry must
  // settle when the attempt does. That transition lives in `internal.ts`
  // (not inside `runCommitAttempt`) so ordinary commits stay unaware of D1.
  const start = await stub.startAttempt("create", null);
  if (!start.ok) {
    await markCreateFailed(db, appId);
    return attemptConflict(appId, start.attemptId);
  }

  await setCreateAttemptId(db, appId, start.attemptId);

  // Handed to the AppDO's alarm rather than run under `waitUntil`, which is
  // killed at ~30s — and a killed attempt writes no terminal status, so the
  // app sat in `creating` until the stale sweep. The alarm outlives the
  // invocation, so a check-worker OOM costs latency instead of the app.
  await stub.scheduleCreateRun(start.attemptId);

  return attemptAccepted(appId, "create", start.attemptId, null, {
    organizationId,
    name,
    appStatus: "creating",
  });
}

async function handleListApps(rc: OrgCtx): Promise<Response> {
  const { organizationId } = rc;
  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return jsonError("organization_not_found", 404);
  }
  const apps = await listAppsForOrganization(
    db,
    organizationId,
    attemptResolver(rc.env)
  );
  return Response.json({ ok: true, organizationId, apps });
}

/**
 * Read one app's registry record.
 *
 * Dispatch already authorized this `appId`, so the read is by id alone —
 * same as every other app-scoped route. The stale-`creating` sweep lives
 * here because a status poll is when reconciling matters.
 */
async function handleGetApp(rc: AppCtx): Promise<Response> {
  const record = await getAppUnscoped(
    createDb(rc.env),
    rc.appId,
    attemptResolver(rc.env)
  );
  if (!record) {
    return jsonError("app_not_found", 404);
  }
  return Response.json({ ok: true, app: record });
}

/**
 * Rename an app. The generated name is a placeholder, so replacing it is an
 * ordinary edit rather than a recovery from an error.
 */
async function handleRenameApp(rc: AppCtx): Promise<Response> {
  const body = (await rc.request.json().catch(() => null)) as {
    name?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) {
    return jsonError("name required");
  }
  if (name.length > APP_NAME_MAX_LENGTH) {
    return jsonError("name_too_long");
  }
  const record = await renameAppUnscoped(createDb(rc.env), rc.appId, name);
  if (!record) {
    return jsonError("app_not_found", 404);
  }
  return Response.json({ ok: true, app: record });
}

/**
 * Delete an app: Durable Object storage first, registry row second.
 *
 * That order is the recoverable one. If the registry delete fails, a row is
 * left pointing at empty storage — visible in the console, and deleting again
 * finishes the job. The reverse leaves storage that no row indexes, and since
 * Durable Objects cannot be enumerated, nothing could ever find it again.
 *
 * Not idempotent by accident: a second delete still asks the DO (cheap, now
 * empty) and reports `removed: false` for the row, so a caller retrying after
 * a partial failure gets told what was actually left to do.
 */
async function handleDeleteApp(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const destroyed = await appStub(rc.env, appId).destroy();
  if (!destroyed.ok) {
    return Response.json({ appId, ...destroyed }, { status: 409 });
  }
  const removed = await deleteAppUnscoped(createDb(rc.env), appId);
  return Response.json({
    ok: true,
    appId,
    removed,
    bytesFreed: destroyed.bytesFreed,
  });
}

async function handleTouch(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const touch = await appStub(rc.env, appId).touch();
  return Response.json({ ok: true, appId, touch });
}

async function handleSql(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    query?: string;
    binds?: unknown[];
  } | null;
  if (!body?.query) {
    return jsonError("query required");
  }
  const db = scopedDb(rc.ctx, appId);
  const ping = await db.pingScope();
  const result = await db
    .prepare(body.query)
    .bind(...(body.binds ?? []))
    .all();
  return Response.json({ ok: true, appId, ping, result });
}

async function handleListVersions(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const listed = await appStub(rc.env, appId).listVersions();
  return Response.json({ appId, ...listed });
}

async function handleGetLive(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const live = await appStub(rc.env, appId).getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return jsonError("no_live_version", 404);
  }
  return Response.json({
    ok: true,
    appId,
    liveVersionId: live.liveVersionId,
    sourceFiles: live.version.sourceFiles,
  });
}

async function handleGetAttempt(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const attemptId = decodeURIComponent(rc.match[2] ?? "");
  const { attempt } = await appStub(rc.env, appId).getAttempt(attemptId);
  if (!attempt) {
    return jsonError("attempt_not_found", 404);
  }
  return Response.json({ ok: true, appId, attempt });
}

async function handleListAttempts(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const raw = Number(rc.url.searchParams.get("limit"));
  const { attempts } = await appStub(rc.env, appId).listAttempts(
    Number.isFinite(raw) && raw > 0 ? raw : undefined
  );
  return Response.json({ ok: true, appId, attempts });
}

async function handleCheck(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    files?: Record<string, string | null>;
    forceCold?: boolean;
  } | null;
  const latest = await appStub(rc.env, appId).getLatest();
  const base = latest.version?.sourceFiles ?? {};
  if (!latest.version?.sourceFiles) {
    return jsonError("no_version_with_sources", 404);
  }
  const files = mergeSources(base, body?.files ?? {});
  const check = await callCheck(
    rc.env,
    appId,
    files,
    body?.forceCold !== false
  );
  // Records nothing. This is a dry-run probe against the latest version, not
  // a commit — it mints no version, so there is no attempt to attach a result
  // to. Persisting it would put a status in the log that never gated anything.
  const pass = checkPasses(check.body);
  return Response.json({
    ok: check.http < 500 && Boolean(check.body?.ok),
    appId,
    baseVersionId: latest.version.id,
    wallMs: check.wallMs,
    publishGate: pass,
    check: check.body,
  });
}

async function handleCommit(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    files?: Record<string, string | null>;
  } | null;
  if (!body?.files || Object.keys(body.files).length === 0) {
    return jsonError("files overlay required");
  }
  const stub = appStub(rc.env, appId);
  const live = await stub.getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return jsonError("no_live_version", 404);
  }
  const files = mergeSources(live.version.sourceFiles, body.files);
  return enqueueCommit(
    rc.env,
    rc.ctx,
    appId,
    "commit",
    files,
    live.liveVersionId
  );
}

async function handleRevert(rc: AppCtx): Promise<Response> {
  const { appId } = rc;
  const body = (await rc.request.json().catch(() => null)) as {
    versionId?: string;
  } | null;
  if (!body?.versionId) {
    return jsonError("versionId required");
  }
  // Stays synchronous: revert restores an already-checked version, so there is
  // nothing to wait on. It still records an attempt (see `AppDO.revertTo`),
  // which is why no status write happens here.
  const result = await appStub(rc.env, appId).revertTo(body.versionId);
  if (!result.ok) {
    return Response.json(
      { appId, ...result },
      { status: result.error === "attempt_in_flight" ? 409 : 404 }
    );
  }
  return Response.json({ appId, action: "revert", ...result });
}

/**
 * Ask a bound worker whether it holds the same `ADMIN_TOKEN` we do.
 *
 * `reachable: false` and `matchesCaller: false` are different diagnoses and
 * must not collapse into one: the first is a broken binding, the second a
 * mismatched secret, and only the second is the failure this probe exists to
 * catch. A throw here is the binding, not the token.
 */
async function probePeerToken(
  binding: Fetcher | undefined,
  token: string | undefined
): Promise<{
  reachable: boolean;
  configured: boolean;
  matchesCaller: boolean;
}> {
  const absent = { reachable: false, configured: false, matchesCaller: false };
  if (!binding) {
    return absent;
  }
  try {
    const res = await binding.fetch("https://peer/health", {
      headers: token ? { "X-Admin-Token": token } : {},
    });
    if (!res.ok) {
      return absent;
    }
    const body = (await res.json()) as {
      adminToken?: { configured?: boolean; matchesCaller?: boolean };
    };
    return {
      reachable: true,
      configured: Boolean(body.adminToken?.configured),
      matchesCaller: Boolean(body.adminToken?.matchesCaller),
    };
  } catch {
    return absent;
  }
}

/**
 * Health, including the one deploy prerequisite nothing else states out loud:
 * factory, check and lint must hold a byte-identical `ADMIN_TOKEN`.
 *
 * Before this, a mismatch first surfaced mid-commit as `lint_failed` with
 * `lintHttp: 401` — an error that names the lint worker when the fault is a
 * secret the factory presented. `adminToken.agree` answers it directly, and
 * answers it *before* anyone tries to commit.
 */
async function handleHealth(rc: AdminCtx): Promise<Response> {
  const token = rc.env.ADMIN_TOKEN;
  const [check, lint] = await Promise.all([
    probePeerToken(rc.env.CHECK, token),
    probePeerToken(rc.env.LINT, token),
  ]);
  return Response.json({
    ok: true,
    service: "sfab-lite-factory",
    phase: "s3d",
    bindings: {
      check: Boolean(rc.env.CHECK),
      lint: Boolean(rc.env.LINT),
      loader: Boolean(rc.env.LOADER),
    },
    adminToken: {
      configured: Boolean(token),
      check,
      lint,
      agree: Boolean(token) && check.matchesCaller && lint.matchesCaller,
    },
    seedFiles: Object.keys(TEMPLATE_SEED.sourceFiles).length,
    seedMigrations: TEMPLATE_SEED.migrations.length,
    // Which sign-in methods this deploy actually has. `/api/config` reports
    // the same two booleans publicly for the sign-in screen; here they are
    // ops diagnostics, which is why the GitHub secrets are reported
    // *separately* rather than as one derived flag: exactly one of them set
    // is the plausible deploy mistake, and it is otherwise indistinguishable
    // from GitHub being off on purpose.
    passwordAuth: passwordAuthEnabled(rc.env),
    githubAuth: githubAuthEnabled(rc.env),
    githubSecrets: githubSecretsPresent(rc.env),
    // Registration, not sign-in. `false` is the intended production state and
    // is reported so "can anyone still create an account here?" is answerable
    // without reading the deploy's env. The allowlist size is reported beside
    // it because it is the other way that answer can be yes — the count alone,
    // since the addresses themselves are not the admin surface's business.
    signUpOpen: signUpOpen(rc.env),
    signUpAllowlisted: signUpAllowlist(rc.env).size,
  });
}

const ADMIN_ROUTES: AdminRoute[] = [
  {
    method: "GET",
    pattern: /^\/admin\/health$/,
    scope: "none",
    handler: handleHealth,
  },
  {
    method: "GET",
    pattern: /^\/admin\/apps$/,
    scope: "organization",
    handler: handleListApps,
  },
  {
    method: "POST",
    pattern: /^\/admin\/apps$/,
    scope: "organization",
    handler: handleCreateApp,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_TOUCH,
    scope: "app",
    handler: handleTouch,
  },
  { method: "POST", pattern: RE_ADMIN_SQL, scope: "app", handler: handleSql },
  {
    method: "GET",
    pattern: RE_ADMIN_VERSIONS,
    scope: "app",
    handler: handleListVersions,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_LIVE,
    scope: "app",
    handler: handleGetLive,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_ATTEMPT,
    scope: "app",
    handler: handleGetAttempt,
  },
  {
    method: "GET",
    pattern: RE_ADMIN_ATTEMPTS,
    scope: "app",
    handler: handleListAttempts,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_CHECK,
    scope: "app",
    handler: handleCheck,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_COMMIT,
    scope: "app",
    handler: handleCommit,
  },
  {
    method: "POST",
    pattern: RE_ADMIN_REVERT,
    scope: "app",
    handler: handleRevert,
  },
  // After `/admin/apps/:id/…` routes so a looser pattern cannot steal them.
  { method: "GET", pattern: RE_ADMIN_APP, scope: "app", handler: handleGetApp },
  {
    method: "PATCH",
    pattern: RE_ADMIN_APP,
    scope: "app",
    handler: handleRenameApp,
  },
  {
    method: "DELETE",
    pattern: RE_ADMIN_APP,
    scope: "app",
    handler: handleDeleteApp,
  },
];

/**
 * Dispatch an authenticated `/admin/*` request.
 *
 * Credential first, route second — deliberately. Resolving the actor before
 * matching means an unknown `/admin/…` path answers 401 rather than 404 to an
 * anonymous caller, so the admin surface is not enumerable by probing.
 *
 * For `scope: "organization"` routes the dispatcher also resolves the org
 * from `?organizationId=` before the handler runs.
 */
export async function dispatchAdmin(rc: RequestCtx): Promise<Response> {
  const db = createDb(rc.env);
  const actor = await resolveActor(rc.env, db, rc.request, rc.url.origin);
  if (actor instanceof Response) {
    return actor;
  }

  const hit = matchRoute(ADMIN_ROUTES, rc.request.method, rc.url.pathname);
  if (!hit) {
    return new Response(NOT_FOUND_BODY, { status: 404 });
  }

  const base: AdminCtx = { ...rc, match: hit.match, actor };
  if (hit.route.scope === "none") {
    return await hit.route.handler(base);
  }

  if (hit.route.scope === "organization") {
    const scope = resolveOrganization(
      actor,
      rc.url.searchParams.get("organizationId") ?? undefined
    );
    if (scope instanceof Response) {
      return scope;
    }
    return await hit.route.handler({
      ...base,
      organizationId: scope.organizationId,
    });
  }

  const appId = decodeURIComponent(hit.match[1] ?? "");
  const denied = await requireAppAccess(db, actor, appId);
  if (denied) {
    return denied;
  }
  return await hit.route.handler({ ...base, appId });
}
