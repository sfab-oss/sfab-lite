/**
 * AppDataDO — runtime SQLite per serve target
 * (`${appId}:live` | `${appId}:pr:N` | later `${appId}:ws:…`).
 *
 * Also exposes a D1-shaped surface (`prepare` / `batch` / `exec`) so LOADER
 * child workers can take this stub as `env.DB`. Caveats vs real D1:
 * - `batch()` is transactionSync sequential emulation
 * - D1 `meta` is approximated from rowsRead/rowsWritten + last_insert_rowid()
 * - drizzle `db.batch` across LOADER→DO RPC must await statements individually
 *   (`prepare().bind()` is async over RPC)
 */
import { DurableObject, RpcTarget } from "cloudflare:workers";
import {
  applyPendingMigrations,
  SCHEMA_VERSION_DDL,
} from "../registry/app-migrations.js";

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

export type SqlValue = null | string | number | bigint | boolean | ArrayBuffer;
export type SqlRow = Record<string, SqlValue>;

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
`.trim();

/** RPC-passable prepared-statement wrapper (D1PreparedStatement shape). */
class SqlStmtStub extends RpcTarget {
  readonly #do: AppDataDO;
  readonly #query: string;
  readonly #binds: SqlValue[];

  constructor(owner: AppDataDO, query: string, binds: SqlValue[] = []) {
    super();
    this.#do = owner;
    this.#query = query;
    this.#binds = binds;
  }

  /** Unwrap for `batch()` — stays on the DO side of the RPC boundary. */
  get _batchItem(): { query: string; binds: SqlValue[] } {
    return { query: this.#query, binds: this.#binds };
  }

  bind(...values: SqlValue[]) {
    return new SqlStmtStub(this.#do, this.#query, [...this.#binds, ...values]);
  }

  first<T = unknown>(colName?: string): Promise<T | null> {
    return Promise.resolve(
      this.#do.execFirst(this.#query, this.#binds, colName) as T | null
    );
  }

  run<T = Record<string, unknown>>() {
    return Promise.resolve(
      this.#do.execRun(this.#query, this.#binds) as {
        success: true;
        meta: unknown;
        results?: T[];
      }
    );
  }

  all<T = Record<string, unknown>>() {
    return Promise.resolve(
      this.#do.execAll(this.#query, this.#binds) as {
        success: true;
        results: T[];
        meta: unknown;
      }
    );
  }

  raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    return Promise.resolve(
      this.#do.execRaw(this.#query, this.#binds, options) as T[]
    );
  }
}

export class AppDataDO extends DurableObject<Env> {
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
    binds: SqlValue[] = []
  ): {
    success: true;
    results: SqlRow[];
    meta: SqlMeta;
  } {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const results = cursor.toArray() as SqlRow[];
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

  execFirst(
    query: string,
    binds: SqlValue[] = [],
    colName?: string
  ): SqlValue | SqlRow | null {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const rows = cursor.toArray() as SqlRow[];
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
    binds: SqlValue[] = []
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
    binds: SqlValue[] = [],
    options?: { columnNames?: boolean }
  ): SqlValue[][] | [string[], ...SqlValue[][]] {
    const cursor = this.ctx.storage.sql.exec(query, ...binds);
    const rawIter = cursor.raw();
    const rows: SqlValue[][] = [];
    for (const row of rawIter) {
      rows.push([...row] as SqlValue[]);
    }
    if (options?.columnNames) {
      return [cursor.columnNames, ...rows];
    }
    return rows;
  }

  execBatch(
    statements: { query: string; binds: SqlValue[] }[]
  ): { success: true; results: SqlRow[]; meta: SqlMeta }[] {
    const out: { success: true; results: SqlRow[]; meta: SqlMeta }[] = [];
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

  prepare(query: string) {
    return new SqlStmtStub(this, query, []);
  }

  batch<T = unknown>(statements: SqlStmtStub[]) {
    const items = statements.map((s) => {
      if (s && typeof s === "object" && "_batchItem" in s) {
        return (s as SqlStmtStub)._batchItem;
      }
      throw new Error("AppDataDO.batch: expected SqlStmtStub from prepare()");
    });
    return this.execBatch(items) as T[];
  }

  exec(query: string) {
    return this.execScript(query);
  }

  pingScope(): {
    dataId: string;
    ok: true;
    backend: "do-sqlite";
  } {
    return {
      dataId: this.ctx.id.name ?? this.ctx.id.toString(),
      ok: true,
      backend: "do-sqlite",
    };
  }
}
