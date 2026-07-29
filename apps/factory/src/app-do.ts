/**
 * AppDO — one Durable Object per sub-app (`idFromName(appId)`).
 * Runtime SQLite only: application tables + migrations ledger + create jobs.
 * Code history lives in the code host; builds in CODE_R2; live tip on D1.
 */
import { DurableObject } from "cloudflare:workers";
import { monotonicFactory } from "ulid";
import {
  applyPendingMigrations,
  SCHEMA_VERSION_DDL,
} from "./app-migrations.js";
import { INTERNAL_TOKEN_HEADER, signAttemptRun } from "./internal-token.js";

const nextUlid = monotonicFactory();

function newJobId(): string {
  return `a_${nextUlid()}`;
}

export interface SqlMeta {
  duration: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  last_row_id: number;
  changed_db: boolean;
  changes: number;
  served_by: "do-sqlite";
}

function d1Meta(cursor: { rowsRead: number; rowsWritten: number }): SqlMeta {
  return {
    duration: 0,
    size_after: 0,
    rows_read: cursor.rowsRead,
    rows_written: cursor.rowsWritten,
    last_row_id: 0,
    changed_db: cursor.rowsWritten > 0,
    changes: cursor.rowsWritten,
    served_by: "do-sqlite",
  };
}

const SEED_CREDENTIALS_KEY = "seed:credentials";

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const META_DDL = `
${SCHEMA_VERSION_DDL}
CREATE TABLE IF NOT EXISTS _sfab_create_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS _sfab_create_jobs_status
  ON _sfab_create_jobs (status);
`.trim();

/** Same ceiling as before — create alarm / waitUntil abandon. */
export const STALE_ATTEMPT_MS = 5 * 60_000;

const CREATE_RUN_KEY = "create-attempt-run";

interface CreateRunState {
  jobId: string;
  tries: number;
}

const CREATE_RUN_TRIES = 3;
const CREATE_RUN_WATCHDOG_MS = 45_000;
const LOOPBACK_ORIGIN = "https://sfab-lite.internal";
const JOB_RETENTION = 50;

type JobStatus = "pending" | "pass" | "fail" | "error";

export interface CreateJobRecord {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
}

interface JobRow {
  id: string;
  status: string;
  created_at: number;
  updated_at: number;
  payload: string | null;
}

function toJobRecord(raw: unknown): CreateJobRecord {
  const row = raw as JobRow;
  let payload: unknown = null;
  if (row.payload) {
    try {
      payload = JSON.parse(row.payload) as unknown;
    } catch {
      payload = row.payload;
    }
  }
  return {
    id: row.id,
    status: row.status as JobStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export class AppDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.#ensureMeta();
      await Promise.resolve();
    });
  }

  #ensureMeta(): void {
    this.ctx.storage.sql.exec("PRAGMA foreign_keys = ON;");
    this.ctx.storage.sql.exec(META_DDL);
    // Greenfield wipe of legacy version tables if an old DO still has them.
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS _sfab_check_status;");
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS _sfab_commit_attempts;");
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS _sfab_live;");
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS _sfab_versions;");
  }

  #ensureAppSchema(migrations: { id: string; sql: string }[]): {
    bootstrapped: boolean;
    appSchemaVersion: number;
    ms: number;
  } {
    const t0 = performance.now();
    this.#ensureMeta();

    const { previousVersion } = applyPendingMigrations(
      (query, ...binds) =>
        this.ctx.storage.sql.exec(query, ...binds).toArray() as Record<
          string,
          unknown
        >[],
      migrations
    );

    return {
      bootstrapped: previousVersion === 0 && migrations.length > 0,
      appSchemaVersion: migrations.length,
      ms: performance.now() - t0,
    };
  }

  bootstrap(migrations: { id: string; sql: string }[]): {
    ok: true;
    bootstrapped: boolean;
    appSchemaVersion: number;
    bootstrapMs: number;
  } {
    if (!migrations.length) {
      throw new Error("bootstrap: migrations required (from template pack)");
    }
    const info = this.#ensureAppSchema(migrations);
    return {
      ok: true,
      bootstrapped: info.bootstrapped,
      appSchemaVersion: info.appSchemaVersion,
      bootstrapMs: info.ms,
    };
  }

  async destroy(): Promise<{ ok: true; bytesFreed: number }> {
    this.#ensureMeta();
    const bytesFreed = Number(this.ctx.storage.sql.databaseSize);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    return { ok: true as const, bytesFreed };
  }

  async scheduleCreateRun(jobId: string): Promise<void> {
    await this.ctx.storage.put<CreateRunState>(CREATE_RUN_KEY, {
      jobId,
      tries: 0,
    });
    await this.ctx.storage.setAlarm(Date.now());
  }

  #jobStatus(jobId: string): JobStatus | null {
    const row = this.ctx.storage.sql
      .exec("SELECT status FROM _sfab_create_jobs WHERE id = ?", jobId)
      .toArray()[0] as { status?: JobStatus } | undefined;
    return row?.status ?? null;
  }

  async #clearCreateRun(): Promise<void> {
    await this.ctx.storage.delete(CREATE_RUN_KEY);
    await this.ctx.storage.deleteAlarm();
  }

  override async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<CreateRunState>(CREATE_RUN_KEY);
    if (!state) {
      return;
    }

    this.#ensureMeta();
    if (this.#jobStatus(state.jobId) !== "pending") {
      await this.#clearCreateRun();
      return;
    }

    if (state.tries >= CREATE_RUN_TRIES) {
      this.failCreateJob(state.jobId, "error", {
        error: "create_retries_exhausted",
        tries: state.tries,
      });
      await this.#clearCreateRun();
      return;
    }

    await this.ctx.storage.put<CreateRunState>(CREATE_RUN_KEY, {
      ...state,
      tries: state.tries + 1,
    });
    await this.ctx.storage.setAlarm(Date.now() + CREATE_RUN_WATCHDOG_MS);

    const ok = await this.#runCreateInHost(state.jobId);
    if (ok) {
      await this.#clearCreateRun();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now());
  }

  async #runCreateInHost(jobId: string): Promise<boolean> {
    const appId = this.ctx.id.name;
    const secret = this.env.BETTER_AUTH_SECRET;
    if (!(appId && secret)) {
      return false;
    }
    const token = await signAttemptRun(secret, appId, jobId);
    const path = `/internal/apps/${encodeURIComponent(appId)}/attempts/${encodeURIComponent(jobId)}/run-create`;
    try {
      const res = await this.env.SELF.fetch(
        new Request(`${LOOPBACK_ORIGIN}${path}`, {
          method: "POST",
          headers: { [INTERNAL_TOKEN_HEADER]: token },
        })
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  touch(): {
    ok: true;
    appIdHint: string;
    appSchemaVersion: number;
    userCount: number | null;
  } {
    this.#ensureMeta();
    const schemaRow = this.ctx.storage.sql
      .exec("SELECT COUNT(*) AS version FROM _sfab_migrations")
      .toArray()[0] as { version?: number } | undefined;
    let userCount: number | null = null;
    try {
      const countRow = this.ctx.storage.sql
        .exec(`SELECT COUNT(*) AS n FROM "user"`)
        .one() as { n: number };
      userCount = Number(countRow.n);
    } catch {
      userCount = null;
    }
    return {
      ok: true,
      appIdHint: this.ctx.id.name ?? this.ctx.id.toString(),
      appSchemaVersion: schemaRow?.version ?? 0,
      userCount,
    };
  }

  ping(): { ok: true; id: string } {
    return { ok: true, id: this.ctx.id.toString() };
  }

  #sweepStaleJobs(): void {
    this.ctx.storage.sql.exec(
      `UPDATE _sfab_create_jobs
          SET status = 'error', updated_at = ?, payload = ?
        WHERE status = 'pending' AND created_at < ?`,
      Date.now(),
      JSON.stringify({ error: "job_abandoned", staleMs: STALE_ATTEMPT_MS }),
      Date.now() - STALE_ATTEMPT_MS
    );
  }

  #pendingJobId(): string | null {
    this.#sweepStaleJobs();
    const running = this.ctx.storage.sql
      .exec("SELECT id FROM _sfab_create_jobs WHERE status = 'pending' LIMIT 1")
      .toArray()[0] as { id?: string } | undefined;
    return running?.id ?? null;
  }

  startCreateJob():
    | { ok: true; jobId: string }
    | { ok: false; error: "job_in_flight"; jobId: string } {
    this.#ensureMeta();
    return this.ctx.storage.transactionSync(() => {
      const running = this.#pendingJobId();
      if (running) {
        return {
          ok: false as const,
          error: "job_in_flight" as const,
          jobId: running,
        };
      }
      const id = newJobId();
      const now = Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO _sfab_create_jobs
          (id, status, created_at, updated_at, payload)
         VALUES (?, 'pending', ?, ?, NULL)`,
        id,
        now,
        now
      );
      this.#pruneJobs();
      return { ok: true as const, jobId: id };
    });
  }

  #pruneJobs(): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM _sfab_create_jobs
        WHERE status != 'pending'
          AND id NOT IN (
            SELECT id FROM _sfab_create_jobs ORDER BY id DESC LIMIT ?
          )`,
      JOB_RETENTION
    );
  }

  failCreateJob(
    jobId: string,
    status: "fail" | "error",
    payload: unknown = null
  ): { ok: true } {
    this.#ensureMeta();
    this.ctx.storage.sql.exec(
      `UPDATE _sfab_create_jobs
          SET status = ?, updated_at = ?, payload = ?
        WHERE id = ?`,
      status,
      Date.now(),
      payload == null ? null : JSON.stringify(payload),
      jobId
    );
    return { ok: true };
  }

  completeCreateJob(jobId: string, payload: unknown = null): { ok: true } {
    this.#ensureMeta();
    this.ctx.storage.sql.exec(
      `UPDATE _sfab_create_jobs
          SET status = 'pass', updated_at = ?, payload = ?
        WHERE id = ?`,
      Date.now(),
      payload == null ? null : JSON.stringify(payload),
      jobId
    );
    return { ok: true };
  }

  getCreateJob(jobId: string): {
    ok: true;
    job: CreateJobRecord | null;
  } {
    this.#ensureMeta();
    this.#sweepStaleJobs();
    const row = this.ctx.storage.sql
      .exec(
        `SELECT id, status, created_at, updated_at, payload
           FROM _sfab_create_jobs WHERE id = ?`,
        jobId
      )
      .toArray()[0];
    return { ok: true, job: row ? toJobRecord(row) : null };
  }

  async seedCredentials(): Promise<{ token: string; password: string }> {
    const stored = await this.ctx.storage.get<{
      token: string;
      password: string;
    }>(SEED_CREDENTIALS_KEY);

    if (stored?.token && stored.password) {
      return stored;
    }

    const minted = { token: randomSecret(), password: randomSecret() };
    await this.ctx.storage.put(SEED_CREDENTIALS_KEY, minted);
    return minted;
  }

  execAll(
    query: string,
    binds: unknown[] = []
  ): {
    success: true;
    results: Record<string, unknown>[];
    meta: SqlMeta;
  } {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const results = cursor.toArray() as Record<string, unknown>[];
    const meta = d1Meta(cursor);
    try {
      const lid = this.ctx.storage.sql
        .exec("SELECT last_insert_rowid() AS id")
        .one() as { id: number };
      meta.last_row_id = Number(lid.id);
    } catch {
      /* ignore */
    }
    return { success: true, results, meta };
  }

  execFirst(query: string, binds: unknown[] = [], colName?: string): unknown {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const rows = cursor.toArray() as Record<string, unknown>[];
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    if (!row) {
      return null;
    }
    if (colName != null) {
      return row[colName] ?? null;
    }
    return row;
  }

  execRun(
    query: string,
    binds: unknown[] = []
  ): { success: true; meta: SqlMeta } {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    cursor.toArray();
    const meta = d1Meta(cursor);
    try {
      const lid = this.ctx.storage.sql
        .exec("SELECT last_insert_rowid() AS id")
        .one() as { id: number };
      meta.last_row_id = Number(lid.id);
    } catch {
      /* ignore */
    }
    return { success: true, meta };
  }

  execRaw(
    query: string,
    binds: unknown[] = [],
    options?: { columnNames?: boolean }
  ): unknown {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const rawIter = cursor.raw();
    const rows: unknown[][] = [];
    for (const row of rawIter) {
      rows.push(row as unknown[]);
    }
    if (options?.columnNames) {
      return [cursor.columnNames, ...rows];
    }
    return rows;
  }

  execBatch(
    statements: { query: string; binds: unknown[] }[]
  ): { success: true; results: unknown[]; meta: SqlMeta }[] {
    const out: { success: true; results: unknown[]; meta: SqlMeta }[] = [];
    this.ctx.storage.transactionSync(() => {
      for (const s of statements) {
        const cursor = this.ctx.storage.sql.exec(s.query, ...s.binds);
        const results = cursor.toArray();
        out.push({
          success: true,
          results,
          meta: d1Meta(cursor),
        });
      }
    });
    return out;
  }

  execScript(query: string): { count: number; duration: number } {
    const t0 = performance.now();
    const cursor = this.ctx.storage.sql.exec(query);
    cursor.toArray();
    return { count: cursor.rowsWritten, duration: performance.now() - t0 };
  }
}
