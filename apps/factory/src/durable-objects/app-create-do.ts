/**
 * AppCreateDO — create jobs + DO alarms only (`idFromName(appId)`).
 */
import { DurableObject } from "cloudflare:workers";
import { monotonicFactory } from "ulid";
import {
  INTERNAL_TOKEN_HEADER,
  signAttemptRun,
} from "../apps/internal-token.js";

const nextUlid = monotonicFactory();

function newJobId(): string {
  return `a_${nextUlid()}`;
}

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

const META_DDL = `
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

export class AppCreateDO extends DurableObject<Env> {
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
}
