/**
 * AppDO — one Durable Object per sub-app (`idFromName(appId)`).
 * Owns SQLite: application tables + append-only version store + live pointer.
 *
 * Storage rules:
 * - `_sfab_versions` is append-only (INSERT only; never UPDATE a version row)
 * - every version has `parent_id` (null for the seed tip's parent)
 * - `_sfab_live` is a pointer only — live source is never stored inline
 * - revert appends a new version; it never moves the pointer backwards alone
 */
import { DurableObject } from "cloudflare:workers";
import { monotonicFactory } from "ulid";
import {
  introspectSchema as readSchemaSnapshot,
  type SchemaSnapshot,
} from "./schema-ddl.js";

/**
 * Version ids are monotonic ULIDs: 48-bit ms timestamp + 80 bits entropy,
 * Crockford base32. Unique *and* lexicographically sortable by creation
 * time, which is why `listVersions` can order on `id` instead of
 * `created_at` — `created_at` is also `Date.now()`, so ties there are
 * ambiguous and "the latest version" was resolvable to the wrong row.
 *
 * The monotonic factory matters: plain `ulid()` randomises within a single
 * millisecond, which would move the ambiguity rather than remove it. This
 * one guarantees each id is strictly greater than the last.
 *
 * Minted only here, in the DO — the single writer and serialization point
 * for an app. Handing this to the host worker would put two isolates on
 * two independent sequences and the guarantee would be nominal.
 */
const nextUlid = monotonicFactory();

function newVersionId(): string {
  return `v_${nextUlid()}`;
}

/**
 * Attempt ids share the version sequence deliberately: an attempt and the
 * version it may mint are the same event seen before and after the gate, so
 * ordering one against the other has to be meaningful. The prefix keeps them
 * impossible to confuse in a URL or a log line.
 */
function newAttemptId(): string {
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

/** Host-owned meta DDL (prefixed `_sfab_` to avoid colliding with app tables). */
const META_DDL = `
CREATE TABLE IF NOT EXISTS _sfab_schema_version (
  version INTEGER PRIMARY KEY NOT NULL
);
CREATE TABLE IF NOT EXISTS _sfab_versions (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  source_files TEXT,
  server_bundle TEXT,
  assets TEXT,
  kernel_version TEXT,
  server_surface_hash TEXT,
  FOREIGN KEY (parent_id) REFERENCES _sfab_versions(id)
);
CREATE TABLE IF NOT EXISTS _sfab_live (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version_id TEXT
);
CREATE TABLE IF NOT EXISTS _sfab_commit_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  parent_id TEXT,
  version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT,
  FOREIGN KEY (version_id) REFERENCES _sfab_versions(id)
);
CREATE INDEX IF NOT EXISTS _sfab_commit_attempts_status
  ON _sfab_commit_attempts (status);
`.trim();

/**
 * A pending attempt older than this is presumed dead and swept to `error`.
 *
 * `waitUntil` is best-effort: a dropped invocation would otherwise leave an
 * attempt pending forever, and the one-in-flight rule would lock the app out
 * of committing. Five minutes is the factory's `limits.cpu_ms` ceiling
 * (`wrangler.jsonc`) — past it the work provably cannot still be running.
 *
 * Exported so the app registry can reuse the same ceiling for stale
 * `creating` rows (same cause: a dropped `waitUntil` between the D1 insert
 * and a terminal attempt status). Two timeouts for one failure mode would
 * drift.
 */
export const STALE_ATTEMPT_MS = 5 * 60_000;

export type AttemptKind = "create" | "commit" | "revert";
type AttemptStatus = "pending" | "pass" | "fail" | "error";

export interface AttemptRecord {
  id: string;
  kind: AttemptKind;
  status: AttemptStatus;
  parentId: string | null;
  versionId: string | null;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
}

/** Attempts are an event log, not history — versions are the history. */
const ATTEMPT_RETENTION = 50;

interface AttemptRow {
  id: string;
  kind: string;
  status: string;
  parent_id: string | null;
  version_id: string | null;
  created_at: number;
  updated_at: number;
  payload: string | null;
}

/**
 * The single SQL-row → record boundary for attempts. Takes `unknown` on
 * purpose: cursor rows are `Record<string, SqlStorageValue>`, and narrowing
 * here means neither caller needs a cast of its own.
 */
function toAttemptRecord(raw: unknown): AttemptRecord {
  const row = raw as AttemptRow;
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
    kind: row.kind as AttemptKind,
    status: row.status as AttemptStatus,
    parentId: row.parent_id,
    versionId: row.version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload,
  };
}

export interface PutVersionInput {
  parentId: string | null;
  sourceFiles: Record<string, string>;
  serverBundle: string;
  assets: Record<string, string>;
  kernelVersion: string;
  /** Null only when reverting a pre-column version row. */
  serverSurfaceHash: string | null;
}

export interface VersionRecord {
  id: string;
  parentId: string | null;
  createdAt: number;
  sourceFiles: Record<string, string> | null;
  serverBundle: string;
  assets: Record<string, string>;
  kernelVersion: string;
  /** Null on versions published before the server-surface column existed. */
  serverSurfaceHash: string | null;
}

export class AppDO extends DurableObject {
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
    // An earlier design removed `_sfab_check_status`. It was keyed by version_id and only
    // ever written *after* a version existed, so it could never describe a
    // commit still in flight — `_sfab_commit_attempts` replaces it. DOs
    // deployed before that change still carry the old table and `CREATE TABLE IF NOT
    // EXISTS` cannot remove it, so drop it here.
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS _sfab_check_status;");
    this.#ensureServerSurfaceHashColumn();
  }

  #ensureServerSurfaceHashColumn(): void {
    const cols = this.ctx.storage.sql
      .exec("PRAGMA table_info(_sfab_versions)")
      .toArray() as { name: string }[];
    if (!cols.some((c) => c.name === "server_surface_hash")) {
      this.ctx.storage.sql.exec(
        "ALTER TABLE _sfab_versions ADD COLUMN server_surface_hash TEXT"
      );
    }
  }

  /**
   * Apply app-schema migrations from the template seed (or later agent
   * additive migrations). Forward-only; schema version = migration count.
   */
  #ensureAppSchema(migrations: { id: string; sql: string }[]): {
    bootstrapped: boolean;
    appSchemaVersion: number;
    ms: number;
  } {
    const t0 = performance.now();
    this.#ensureMeta();

    const row = this.ctx.storage.sql
      .exec("SELECT version FROM _sfab_schema_version LIMIT 1")
      .toArray()[0] as { version?: number } | undefined;
    const current = row?.version ?? 0;
    let bootstrapped = false;

    if (migrations.length > 0 && current < migrations.length) {
      for (let i = current; i < migrations.length; i++) {
        const migration = migrations[i];
        if (!migration) {
          continue;
        }
        this.ctx.storage.sql.exec(migration.sql);
      }
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO _sfab_schema_version (version) VALUES (?)",
        migrations.length
      );
      bootstrapped = current === 0;
    }

    return {
      bootstrapped,
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

  /**
   * The tables this app really has, as `diffSchema` wants them.
   *
   * This is the half that was missing. `src/db/schema.ts` describes tables;
   * only this says what exists. Reading it here rather than through `execAll`
   * keeps the PRAGMA walk on the single writer, so it cannot observe a shape
   * halfway through a migration.
   */
  introspectSchema(): SchemaSnapshot {
    this.#ensureMeta();
    return readSchemaSnapshot(
      (query) =>
        this.ctx.storage.sql.exec(query).toArray() as Record<string, unknown>[]
    );
  }

  /**
   * Drop everything this app owns: versions, attempts, and its own tables.
   *
   * The in-flight refusal is decided **here** rather than by the caller. A
   * caller-side check would pass and then race the `waitUntil` chain that runs
   * commits, which writes through this object and would recreate rows in
   * storage the registry no longer indexes — and a Durable Object nothing
   * indexes cannot be found again, because `idFromName` is a hash.
   *
   * `deleteAll` is atomic on SQLite-backed storage. It does not clear alarms;
   * this class sets none, and a future one must delete its own before calling.
   */
  async destroy(): Promise<
    | { ok: true; bytesFreed: number }
    | { ok: false; error: "attempt_in_flight"; attemptId: string }
  > {
    this.#ensureMeta();
    const running = this.ctx.storage.transactionSync(() =>
      this.#pendingAttemptId()
    );
    if (running) {
      return {
        ok: false as const,
        error: "attempt_in_flight" as const,
        attemptId: running,
      };
    }
    const bytesFreed = Number(this.ctx.storage.sql.databaseSize);
    await this.ctx.storage.deleteAll();
    return { ok: true as const, bytesFreed };
  }

  touch(): {
    ok: true;
    appIdHint: string;
    appSchemaVersion: number;
    userCount: number | null;
    liveVersionId: string | null;
  } {
    this.#ensureMeta();
    const schemaRow = this.ctx.storage.sql
      .exec("SELECT version FROM _sfab_schema_version LIMIT 1")
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
    const live = this.ctx.storage.sql
      .exec("SELECT version_id FROM _sfab_live WHERE singleton = 1")
      .toArray()[0] as { version_id?: string } | undefined;
    return {
      ok: true,
      appIdHint: this.ctx.id.name ?? this.ctx.id.toString(),
      appSchemaVersion: schemaRow?.version ?? 0,
      userCount,
      liveVersionId: live?.version_id ?? null,
    };
  }

  ping(): { ok: true; id: string } {
    return { ok: true, id: this.ctx.id.toString() };
  }

  /**
   * Append a checked version and point live at it.
   * INSERT only — never UPDATE an existing version row.
   */
  putVersion(input: PutVersionInput): {
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  } {
    this.#ensureMeta();
    return this.#putVersionSync(input);
  }

  /** Sync core of `putVersion`, callable from inside `transactionSync`. */
  #putVersionSync(input: PutVersionInput): {
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  } {
    const id = newVersionId();
    if (input.parentId != null) {
      const parent = this.ctx.storage.sql
        .exec("SELECT id FROM _sfab_versions WHERE id = ?", input.parentId)
        .toArray();
      if (parent.length === 0) {
        throw new Error(`putVersion: parent_id ${input.parentId} not found`);
      }
    }
    const createdAt = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO _sfab_versions
        (id, parent_id, created_at, source_files, server_bundle, assets,
         kernel_version, server_surface_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.parentId,
      createdAt,
      JSON.stringify(input.sourceFiles),
      input.serverBundle,
      JSON.stringify(input.assets),
      input.kernelVersion,
      input.serverSurfaceHash
    );
    // A version only exists if checks passed, and on creation it is live.
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO _sfab_live (singleton, version_id) VALUES (1, ?)",
      id
    );
    return {
      ok: true,
      id,
      liveVersionId: id,
      parentId: input.parentId,
    };
  }

  /**
   * Revert = append a new version whose content equals an older one.
   * Never move the live pointer backwards onto the old id.
   */
  async revertTo(versionId: string): Promise<
    | {
        ok: true;
        id: string;
        attemptId: string;
        liveVersionId: string;
        parentId: string;
        restoredFrom: string;
      }
    | { ok: false; error: string }
  > {
    this.#ensureMeta();
    const { version } = await this.getVersion(versionId);
    if (!version?.sourceFiles) {
      return { ok: false, error: "version_not_found" };
    }
    const live = await this.getLive();
    if (!live.liveVersionId) {
      return { ok: false, error: "no_live_version" };
    }
    if (live.liveVersionId === versionId) {
      return { ok: false, error: "already_live" };
    }
    // Revert goes through the attempt path even though it never waits on a
    // check: it is subject to the same one-in-flight rule (reverting mid-commit
    // would race the parent pointer), and `kind` is the only place the history
    // records *why* a version exists. It settles in the same DO turn, so a
    // revert attempt is never observably pending.
    const start = this.startAttempt("revert", live.liveVersionId);
    if (!start.ok) {
      return { ok: false, error: start.error };
    }
    const put = this.completeAttempt(
      start.attemptId,
      {
        parentId: live.liveVersionId,
        sourceFiles: version.sourceFiles,
        serverBundle: version.serverBundle,
        assets: version.assets,
        kernelVersion: version.kernelVersion,
        serverSurfaceHash: version.serverSurfaceHash,
      },
      { source: "revert", restoredFrom: versionId, trusted: true }
    );
    return {
      ok: true,
      id: put.id,
      attemptId: start.attemptId,
      liveVersionId: put.liveVersionId,
      parentId: live.liveVersionId,
      restoredFrom: versionId,
    };
  }

  listVersions(): {
    ok: true;
    liveVersionId: string | null;
    versions: {
      id: string;
      parentId: string | null;
      createdAt: number;
      kernelVersion: string;
      serverBundleBytes: number;
      assetKeys: string[];
    }[];
  } {
    this.#ensureMeta();
    const live = this.ctx.storage.sql
      .exec("SELECT version_id FROM _sfab_live WHERE singleton = 1")
      .toArray()[0] as { version_id?: string } | undefined;
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, parent_id, created_at, kernel_version, server_bundle, assets
         FROM _sfab_versions ORDER BY id DESC`
      )
      .toArray() as {
      id: string;
      parent_id: string | null;
      created_at: number;
      kernel_version: string;
      server_bundle: string;
      assets: string;
    }[];
    return {
      ok: true,
      liveVersionId: live?.version_id ?? null,
      versions: rows.map((r) => {
        let assetKeys: string[] = [];
        try {
          assetKeys = Object.keys(
            JSON.parse(r.assets) as Record<string, string>
          );
        } catch {
          assetKeys = [];
        }
        return {
          id: r.id,
          parentId: r.parent_id,
          createdAt: r.created_at,
          kernelVersion: r.kernel_version,
          serverBundleBytes: r.server_bundle?.length ?? 0,
          assetKeys,
        };
      }),
    };
  }

  getVersion(versionId: string): {
    ok: true;
    version: VersionRecord | null;
  } {
    const row = this.ctx.storage.sql
      .exec(
        `SELECT id, parent_id, created_at, source_files, server_bundle, assets,
                kernel_version, server_surface_hash
         FROM _sfab_versions WHERE id = ?`,
        versionId
      )
      .toArray()[0] as
      | {
          id: string;
          parent_id: string | null;
          created_at: number;
          source_files: string | null;
          server_bundle: string;
          assets: string;
          kernel_version: string;
          server_surface_hash: string | null;
        }
      | undefined;
    if (!row) {
      return { ok: true, version: null };
    }
    return {
      ok: true,
      version: {
        id: row.id,
        parentId: row.parent_id,
        createdAt: row.created_at,
        sourceFiles: row.source_files
          ? (JSON.parse(row.source_files) as Record<string, string>)
          : null,
        serverBundle: row.server_bundle,
        assets: JSON.parse(row.assets) as Record<string, string>,
        kernelVersion: row.kernel_version,
        serverSurfaceHash: row.server_surface_hash ?? null,
      },
    };
  }

  /**
   * Sweep pending attempts that outlived `STALE_ATTEMPT_MS`.
   *
   * Async commit moved the work into `waitUntil`, which is best-effort — a
   * dropped invocation writes no terminal status. Without this the app would
   * be permanently blocked by the one-in-flight rule below.
   */
  #sweepStaleAttempts(): void {
    this.ctx.storage.sql.exec(
      `UPDATE _sfab_commit_attempts
          SET status = 'error', updated_at = ?, payload = ?
        WHERE status = 'pending' AND created_at < ?`,
      Date.now(),
      JSON.stringify({ error: "attempt_abandoned", staleMs: STALE_ATTEMPT_MS }),
      Date.now() - STALE_ATTEMPT_MS
    );
  }

  /**
   * The attempt currently in flight, after sweeping the stale ones.
   *
   * Callers must run this inside `transactionSync` — the answer is only
   * meaningful while nothing else can open an attempt between the read and
   * whatever the caller does about it.
   */
  #pendingAttemptId(): string | null {
    this.#sweepStaleAttempts();
    const running = this.ctx.storage.sql
      .exec(
        "SELECT id FROM _sfab_commit_attempts WHERE status = 'pending' LIMIT 1"
      )
      .toArray()[0] as { id?: string } | undefined;
    return running?.id ?? null;
  }

  /**
   * Open a commit attempt, or refuse because one is already running.
   *
   * **At most one attempt in flight per app.** Two concurrent commits would
   * both check against the same parent and both mint a version, quietly
   * breaking the linear history the whole model rests on. Refusing is also
   * the honest answer to the agent: its edit did not land, rather than
   * landing later against a tree it never saw.
   */
  startAttempt(
    kind: AttemptKind,
    parentId: string | null
  ):
    | { ok: true; attemptId: string }
    | { ok: false; error: "attempt_in_flight"; attemptId: string } {
    this.#ensureMeta();
    return this.ctx.storage.transactionSync(() => {
      const running = this.#pendingAttemptId();
      if (running) {
        return {
          ok: false as const,
          error: "attempt_in_flight" as const,
          attemptId: running,
        };
      }
      const id = newAttemptId();
      const now = Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO _sfab_commit_attempts
          (id, kind, status, parent_id, version_id, created_at, updated_at, payload)
         VALUES (?, ?, 'pending', ?, NULL, ?, ?, NULL)`,
        id,
        kind,
        parentId,
        now,
        now
      );
      this.#pruneAttempts();
      return { ok: true as const, attemptId: id };
    });
  }

  /**
   * Keep the attempt log bounded. Never touches `pending` rows — an attempt
   * still running is not a candidate for eviction however old the log is.
   */
  #pruneAttempts(): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM _sfab_commit_attempts
        WHERE status != 'pending'
          AND id NOT IN (
            SELECT id FROM _sfab_commit_attempts ORDER BY id DESC LIMIT ?
          )`,
      ATTEMPT_RETENTION
    );
  }

  /** Terminal failure — no version is minted. */
  failAttempt(
    attemptId: string,
    status: "fail" | "error",
    payload: unknown = null
  ): { ok: true; attemptId: string; status: string } {
    this.#ensureMeta();
    this.ctx.storage.sql.exec(
      `UPDATE _sfab_commit_attempts
          SET status = ?, updated_at = ?, payload = ?
        WHERE id = ?`,
      status,
      Date.now(),
      payload == null ? null : JSON.stringify(payload),
      attemptId
    );
    return { ok: true, attemptId, status };
  }

  /**
   * Mint the version and settle the attempt in one transaction.
   *
   * Two RPCs would leave a window where the version is live but the attempt
   * still reads `pending` — a poller would show "checking" for code already
   * serving traffic.
   */
  completeAttempt(
    attemptId: string,
    input: PutVersionInput,
    payload: unknown = null
  ): { ok: true; id: string; liveVersionId: string; parentId: string | null } {
    this.#ensureMeta();
    return this.ctx.storage.transactionSync(() => {
      const put = this.#putVersionSync(input);
      this.ctx.storage.sql.exec(
        `UPDATE _sfab_commit_attempts
            SET status = 'pass', version_id = ?, updated_at = ?, payload = ?
          WHERE id = ?`,
        put.id,
        Date.now(),
        payload == null ? null : JSON.stringify(payload),
        attemptId
      );
      return put;
    });
  }

  getAttempt(attemptId: string): {
    ok: true;
    attempt: AttemptRecord | null;
  } {
    this.#ensureMeta();
    // Sweep on read too: a poller must not sit on `pending` forever waiting
    // for a writer that will never come back.
    this.#sweepStaleAttempts();
    const row = this.ctx.storage.sql
      .exec(
        `SELECT id, kind, status, parent_id, version_id, created_at, updated_at, payload
           FROM _sfab_commit_attempts WHERE id = ?`,
        attemptId
      )
      .toArray()[0];
    return { ok: true, attempt: row ? toAttemptRecord(row) : null };
  }

  listAttempts(limit = 20): {
    ok: true;
    attempts: AttemptRecord[];
  } {
    this.#ensureMeta();
    this.#sweepStaleAttempts();
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, kind, status, parent_id, version_id, created_at, updated_at, payload
           FROM _sfab_commit_attempts ORDER BY id DESC LIMIT ?`,
        Math.max(1, Math.min(limit, 100))
      )
      .toArray();
    return { ok: true, attempts: rows.map(toAttemptRecord) };
  }

  /** Latest version by created_at — equals live tip under append-only commit. */
  getLatest(): {
    ok: true;
    version: VersionRecord | null;
  } {
    this.#ensureMeta();
    const row = this.ctx.storage.sql
      .exec("SELECT id FROM _sfab_versions ORDER BY id DESC LIMIT 1")
      .toArray()[0] as { id?: string } | undefined;
    if (!row?.id) {
      return { ok: true, version: null };
    }
    return this.getVersion(row.id);
  }

  async getLive(): Promise<{
    ok: true;
    liveVersionId: string | null;
    version: VersionRecord | null;
  }> {
    const live = this.ctx.storage.sql
      .exec("SELECT version_id FROM _sfab_live WHERE singleton = 1")
      .toArray()[0] as { version_id?: string } | undefined;
    const liveVersionId = live?.version_id ?? null;
    if (!liveVersionId) {
      return { ok: true, liveVersionId: null, version: null };
    }
    const { version } = await this.getVersion(liveVersionId);
    return { ok: true, liveVersionId, version };
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

  /**
   * Caveat (exp-12): batch is emulated with transactionSync — sequential
   * statements inside one sync transaction. Not byte-identical to D1.batch
   * for every edge case; enough for better-auth/drizzle.
   */
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
