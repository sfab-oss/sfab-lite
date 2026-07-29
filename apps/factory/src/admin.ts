/**
 * `/admin/*` handlers for the factory host worker.
 *
 * Business logic lives here; Hono routing, credential middleware, and
 * `AppType` live in `hono/`. Each handler still receives AdminCtx / OrgCtx /
 * AppCtx built by thin adapters, and returns `{ status, body }` so routes can
 * emit typed `c.json(...)`.
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
import { type AdminReply, adminError } from "./hono/reply.js";
import type {
  CheckBody,
  CommitBody,
  CreateAppBody,
  RenameAppBody,
  RevertBody,
  SqlBody,
} from "./hono/schemas.js";
import { wireApp } from "./hono/wire.js";
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
import type { AdminCtx, AppCtx, OrgCtx } from "./routes.js";
import type { ScopedSqlProps } from "./scoped-sql.js";

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
export async function handleCreateApp(rc: OrgCtx, body: CreateAppBody) {
  const { organizationId } = rc;
  const requested = body.name?.trim();
  if (requested && requested.length > APP_NAME_MAX_LENGTH) {
    return adminError("name_too_long");
  }

  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return adminError("organization_not_found", 404);
  }

  const name =
    requested ||
    pickAppName(await listAppNamesForOrganization(db, organizationId));

  const created = await insertCreatingApp(db, { organizationId, name });
  const appId = created.id;
  const stub = appStub(rc.env, appId);

  try {
    await stub.bootstrap(TEMPLATE_SEED.migrations);
  } catch (e) {
    await markCreateFailed(db, appId);
    return adminError(e instanceof Error ? e.message : "bootstrap_failed", 500);
  }

  const start = await stub.startAttempt("create", null);
  if (!start.ok) {
    await markCreateFailed(db, appId);
    return attemptConflict(appId, start.attemptId);
  }

  await setCreateAttemptId(db, appId, start.attemptId);
  await stub.scheduleCreateRun(start.attemptId);

  return attemptAccepted(appId, "create", start.attemptId, null, {
    organizationId,
    name,
    appStatus: "creating",
  });
}

export async function handleListApps(rc: OrgCtx) {
  const { organizationId } = rc;
  const db = createDb(rc.env);
  if (!(await organizationExists(db, organizationId))) {
    return adminError("organization_not_found", 404);
  }
  const apps = await listAppsForOrganization(
    db,
    organizationId,
    attemptResolver(rc.env)
  );
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      organizationId,
      apps: apps.map(wireApp),
    },
  };
}

/**
 * Read one app's registry record.
 *
 * Dispatch already authorized this `appId`, so the read is by id alone —
 * same as every other app-scoped route. The stale-`creating` sweep lives
 * here because a status poll is when reconciling matters.
 */
export async function handleGetApp(rc: AppCtx) {
  const record = await getAppUnscoped(
    createDb(rc.env),
    rc.appId,
    attemptResolver(rc.env)
  );
  if (!record) {
    return adminError("app_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
}

/**
 * Rename an app. The generated name is a placeholder, so replacing it is an
 * ordinary edit rather than a recovery from an error.
 */
export async function handleRenameApp(rc: AppCtx, body: RenameAppBody) {
  const name = body.name.trim();
  const record = await renameAppUnscoped(createDb(rc.env), rc.appId, name);
  if (!record) {
    return adminError("app_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, app: wireApp(record) },
  };
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
export async function handleDeleteApp(
  rc: AppCtx
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const destroyed = await appStub(rc.env, appId).destroy();
  if (!destroyed.ok) {
    return { status: 409, body: { appId, ...destroyed } };
  }
  const removed = await deleteAppUnscoped(createDb(rc.env), appId);
  return {
    status: 200,
    body: {
      ok: true as const,
      appId,
      removed,
      bytesFreed: destroyed.bytesFreed,
    },
  };
}

export async function handleTouch(rc: AppCtx): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const touch = await appStub(rc.env, appId).touch();
  return { status: 200, body: { ok: true as const, appId, touch } };
}

export async function handleSql(
  rc: AppCtx,
  body: SqlBody
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const db = scopedDb(rc.ctx, appId);
  const ping = await db.pingScope();
  const result = await db
    .prepare(body.query)
    .bind(...(body.binds ?? []))
    .all();
  return { status: 200, body: { ok: true as const, appId, ping, result } };
}

export async function handleListVersions(rc: AppCtx) {
  const { appId } = rc;
  const listed = await appStub(rc.env, appId).listVersions();
  return { status: 200 as const, body: { appId, ...listed } };
}

export async function handleGetLive(rc: AppCtx) {
  const { appId } = rc;
  const live = await appStub(rc.env, appId).getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return adminError("no_live_version", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId,
      liveVersionId: live.liveVersionId,
      sourceFiles: live.version.sourceFiles,
    },
  };
}

export async function handleGetAttempt(rc: AppCtx) {
  const { appId } = rc;
  const attemptId = rc.attemptId ?? decodeURIComponent(rc.match[2] ?? "");
  const { attempt } = await appStub(rc.env, appId).getAttempt(attemptId);
  if (!attempt) {
    return adminError("attempt_not_found", 404);
  }
  return {
    status: 200 as const,
    body: { ok: true as const, appId, attempt },
  };
}

export async function handleListAttempts(
  rc: AppCtx
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const raw = Number(rc.url.searchParams.get("limit"));
  const { attempts } = await appStub(rc.env, appId).listAttempts(
    Number.isFinite(raw) && raw > 0 ? raw : undefined
  );
  return { status: 200, body: { ok: true as const, appId, attempts } };
}

export async function handleCheck(
  rc: AppCtx,
  body: CheckBody
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const latest = await appStub(rc.env, appId).getLatest();
  const base = latest.version?.sourceFiles ?? {};
  if (!latest.version?.sourceFiles) {
    return adminError("no_version_with_sources", 404);
  }
  const files = mergeSources(base, body.files ?? {});
  const check = await callCheck(rc.env, appId, files, body.forceCold !== false);
  const pass = checkPasses(check.body);
  return {
    status: 200,
    body: {
      ok: check.http < 500 && Boolean(check.body?.ok),
      appId,
      baseVersionId: latest.version.id,
      wallMs: check.wallMs,
      publishGate: pass,
      check: check.body,
    },
  };
}

export async function handleCommit(
  rc: AppCtx,
  body: CommitBody
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const stub = appStub(rc.env, appId);
  const live = await stub.getLive();
  if (!(live.version?.sourceFiles && live.liveVersionId)) {
    return adminError("no_live_version", 404);
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

export async function handleRevert(
  rc: AppCtx,
  body: RevertBody
): Promise<AdminReply<unknown>> {
  const { appId } = rc;
  const result = await appStub(rc.env, appId).revertTo(body.versionId);
  if (!result.ok) {
    return {
      status: result.error === "attempt_in_flight" ? 409 : 404,
      body: { appId, ...result },
    };
  }
  return { status: 200, body: { appId, action: "revert" as const, ...result } };
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
export async function handleHealth(rc: AdminCtx): Promise<AdminReply<unknown>> {
  const token = rc.env.ADMIN_TOKEN;
  const [check, lint] = await Promise.all([
    probePeerToken(rc.env.CHECK, token),
    probePeerToken(rc.env.LINT, token),
  ]);
  return {
    status: 200,
    body: {
      ok: true as const,
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
      passwordAuth: passwordAuthEnabled(rc.env),
      githubAuth: githubAuthEnabled(rc.env),
      githubSecrets: githubSecretsPresent(rc.env),
      signUpOpen: signUpOpen(rc.env),
      signUpAllowlisted: signUpAllowlist(rc.env).size,
    },
  };
}
