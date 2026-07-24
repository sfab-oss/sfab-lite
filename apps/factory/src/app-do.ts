/**
 * AppDO — one Durable Object per sub-app (`idFromName(appId)`).
 * Owns SQLite: application tables + append-only version store + live pointer.
 *
 * Storage rules (S3 folded into S2):
 * - `_sfab_versions` is append-only (INSERT only; never UPDATE a version row)
 * - every version has `parent_id` (null for the seed tip's parent)
 * - `_sfab_live` is a pointer only — live source is never stored inline
 * - revert appends a new version; it never moves the pointer backwards alone
 */
import { DurableObject } from "cloudflare:workers";
import { monotonicFactory } from "ulid";

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
  FOREIGN KEY (parent_id) REFERENCES _sfab_versions(id)
);
CREATE TABLE IF NOT EXISTS _sfab_live (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version_id TEXT
);
CREATE TABLE IF NOT EXISTS _sfab_check_status (
  version_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT
);
`.trim();

export interface VersionRecord {
  id: string;
  parentId: string | null;
  createdAt: number;
  sourceFiles: Record<string, string> | null;
  serverBundle: string;
  assets: Record<string, string>;
  kernelVersion: string;
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
  putVersion(input: {
    parentId: string | null;
    sourceFiles: Record<string, string>;
    serverBundle: string;
    assets: Record<string, string>;
    kernelVersion: string;
  }): {
    ok: true;
    id: string;
    liveVersionId: string;
    parentId: string | null;
  } {
    this.#ensureMeta();
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
        (id, parent_id, created_at, source_files, server_bundle, assets, kernel_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.parentId,
      createdAt,
      JSON.stringify(input.sourceFiles),
      input.serverBundle,
      JSON.stringify(input.assets),
      input.kernelVersion
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
    const put = await this.putVersion({
      parentId: live.liveVersionId,
      sourceFiles: version.sourceFiles,
      serverBundle: version.serverBundle,
      assets: version.assets,
      kernelVersion: version.kernelVersion,
    });
    return {
      ok: true,
      id: put.id,
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
        `SELECT id, parent_id, created_at, source_files, server_bundle, assets, kernel_version
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
      },
    };
  }

  setCheckStatus(
    versionId: string,
    status: "pending" | "pass" | "fail" | "error",
    payload: unknown = null
  ): { ok: true; versionId: string; status: string } {
    this.#ensureMeta();
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO _sfab_check_status
        (version_id, status, updated_at, payload)
       VALUES (?, ?, ?, ?)`,
      versionId,
      status,
      Date.now(),
      payload == null ? null : JSON.stringify(payload)
    );
    return { ok: true, versionId, status };
  }

  getCheckStatus(versionId: string): {
    ok: true;
    versionId: string;
    status: "pending" | "pass" | "fail" | "error" | "missing";
    updatedAt: number | null;
    payload: unknown;
  } {
    this.#ensureMeta();
    const row = this.ctx.storage.sql
      .exec(
        "SELECT status, updated_at, payload FROM _sfab_check_status WHERE version_id = ?",
        versionId
      )
      .toArray()[0] as
      | { status?: string; updated_at?: number; payload?: string | null }
      | undefined;
    if (!row?.status) {
      return {
        ok: true,
        versionId,
        status: "missing",
        updatedAt: null,
        payload: null,
      };
    }
    let payload: unknown = null;
    if (row.payload) {
      try {
        payload = JSON.parse(row.payload) as unknown;
      } catch {
        payload = row.payload;
      }
    }
    return {
      ok: true,
      versionId,
      status: row.status as "pending" | "pass" | "fail" | "error",
      updatedAt: row.updated_at ?? null,
      payload,
    };
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
