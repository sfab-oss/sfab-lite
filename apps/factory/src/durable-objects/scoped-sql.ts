/**
 * Props-scoped SQL facade for Dynamic Workers — DO SQLite backend.
 * Productized from artifacts/exp-12 (same shape as C1 ScopedD1).
 *
 * Caveats (kept from E12):
 * - batch() → AppDataDO.transactionSync sequential emulation
 * - D1 `meta` approximated from rowsRead/rowsWritten + last_insert_rowid()
 * - drizzle `db.batch` from Dynamic Workers hits RpcPromise serialization
 *   (`prepare().bind()` is async over RPC); await statements individually
 */
import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import type { AppDataDO } from "./app-data-do.js";

export interface ScopedSqlProps {
  /** AppDataDO idFromName key (`${appId}:live` | `${appId}:pr:N` | …). */
  dataId: string;
}

interface ParentEnv {
  APP_DATA_DO: DurableObjectNamespace<AppDataDO>;
}

function doStub(env: ParentEnv, dataId: string) {
  return env.APP_DATA_DO.get(env.APP_DATA_DO.idFromName(dataId));
}

/** RPC-passable prepared-statement wrapper (D1PreparedStatement shape). */
class SqlStmtStub extends RpcTarget {
  private readonly env: ParentEnv;
  private readonly dataId: string;
  private readonly query: string;
  private readonly binds: unknown[];

  constructor(
    env: ParentEnv,
    dataId: string,
    query: string,
    binds: unknown[] = []
  ) {
    super();
    this.env = env;
    this.dataId = dataId;
    this.query = query;
    this.binds = binds;
  }

  /** Parent-local unwrap for batch(). */
  get _batchItem(): { query: string; binds: unknown[]; dataId: string } {
    return { query: this.query, binds: this.binds, dataId: this.dataId };
  }

  bind(...values: unknown[]) {
    return new SqlStmtStub(this.env, this.dataId, this.query, [
      ...this.binds,
      ...values,
    ]);
  }

  first<T = unknown>(colName?: string): Promise<T | null> {
    return doStub(this.env, this.dataId).execFirst(
      this.query,
      this.binds,
      colName
    ) as Promise<T | null>;
  }

  run<T = Record<string, unknown>>() {
    return doStub(this.env, this.dataId).execRun(
      this.query,
      this.binds
    ) as Promise<{
      success: true;
      meta: unknown;
      results?: T[];
    }>;
  }

  all<T = Record<string, unknown>>() {
    return doStub(this.env, this.dataId).execAll(
      this.query,
      this.binds
    ) as Promise<{
      success: true;
      results: T[];
      meta: unknown;
    }>;
  }

  raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    return doStub(this.env, this.dataId).execRaw(
      this.query,
      this.binds,
      options
    ) as Promise<T[]>;
  }
}

export class ScopedSql extends WorkerEntrypoint<ParentEnv, ScopedSqlProps> {
  #assertScope() {
    const id = this.ctx.props?.dataId;
    if (!id || typeof id !== "string") {
      throw new Error("ScopedSql: missing props.dataId (capability denied)");
    }
    return id;
  }

  prepare(query: string) {
    const dataId = this.#assertScope();
    return new SqlStmtStub(this.env, dataId, query, []);
  }

  batch<T = unknown>(statements: SqlStmtStub[]) {
    const dataId = this.#assertScope();
    const items = statements.map((s) => {
      if (s && typeof s === "object" && "_batchItem" in s) {
        const item = (s as SqlStmtStub)._batchItem;
        if (item.dataId !== dataId) {
          throw new Error("ScopedSql.batch: statement dataId mismatch");
        }
        return { query: item.query, binds: item.binds };
      }
      throw new Error("ScopedSql.batch: expected SqlStmtStub from prepare()");
    });
    return doStub(this.env, dataId).execBatch(items) as Promise<T[]>;
  }

  exec(query: string) {
    const dataId = this.#assertScope();
    return doStub(this.env, dataId).execScript(query);
  }

  pingScope(): {
    dataId: string;
    ok: true;
    backend: "do-sqlite";
  } {
    return { dataId: this.#assertScope(), ok: true, backend: "do-sqlite" };
  }
}
