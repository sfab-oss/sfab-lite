/**
 * Props-scoped SQL facade for Dynamic Workers — DO SQLite backend.
 * Productized from artifacts/exp-12 (same shape as C1 ScopedD1).
 *
 * Caveats (kept from E12):
 * - batch() → AppDO.transactionSync sequential emulation
 * - D1 `meta` approximated from rowsRead/rowsWritten + last_insert_rowid()
 */
import { RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import type { AppDO } from "./app-do.js";

export interface ScopedSqlProps {
  /** Capability / sub-app token — required for any DB op. */
  appId: string;
}

interface ParentEnv {
  APP_DO: DurableObjectNamespace<AppDO>;
}

function doStub(env: ParentEnv, appId: string) {
  return env.APP_DO.get(env.APP_DO.idFromName(appId));
}

/** RPC-passable prepared-statement wrapper (D1PreparedStatement shape). */
class SqlStmtStub extends RpcTarget {
  private readonly env: ParentEnv;
  private readonly appId: string;
  private readonly query: string;
  private readonly binds: unknown[];

  constructor(
    env: ParentEnv,
    appId: string,
    query: string,
    binds: unknown[] = []
  ) {
    super();
    this.env = env;
    this.appId = appId;
    this.query = query;
    this.binds = binds;
  }

  /** Parent-local unwrap for batch(). */
  get _batchItem(): { query: string; binds: unknown[]; appId: string } {
    return { query: this.query, binds: this.binds, appId: this.appId };
  }

  bind(...values: unknown[]) {
    return new SqlStmtStub(this.env, this.appId, this.query, [
      ...this.binds,
      ...values,
    ]);
  }

  first<T = unknown>(colName?: string): Promise<T | null> {
    return doStub(this.env, this.appId).execFirst(
      this.query,
      this.binds,
      colName
    ) as Promise<T | null>;
  }

  run<T = Record<string, unknown>>() {
    return doStub(this.env, this.appId).execRun(
      this.query,
      this.binds
    ) as Promise<{
      success: true;
      meta: unknown;
      results?: T[];
    }>;
  }

  all<T = Record<string, unknown>>() {
    return doStub(this.env, this.appId).execAll(
      this.query,
      this.binds
    ) as Promise<{
      success: true;
      results: T[];
      meta: unknown;
    }>;
  }

  raw<T = unknown[]>(options?: { columnNames?: boolean }) {
    return doStub(this.env, this.appId).execRaw(
      this.query,
      this.binds,
      options
    ) as Promise<T[]>;
  }
}

export class ScopedSql extends WorkerEntrypoint<ParentEnv, ScopedSqlProps> {
  #assertScope() {
    const id = this.ctx.props?.appId;
    if (!id || typeof id !== "string") {
      throw new Error("ScopedSql: missing props.appId (capability denied)");
    }
    return id;
  }

  prepare(query: string) {
    const appId = this.#assertScope();
    return new SqlStmtStub(this.env, appId, query, []);
  }

  batch<T = unknown>(statements: SqlStmtStub[]) {
    const appId = this.#assertScope();
    const items = statements.map((s) => {
      if (s && typeof s === "object" && "_batchItem" in s) {
        const item = (s as SqlStmtStub)._batchItem;
        if (item.appId !== appId) {
          throw new Error("ScopedSql.batch: statement appId mismatch");
        }
        return { query: item.query, binds: item.binds };
      }
      throw new Error("ScopedSql.batch: expected SqlStmtStub from prepare()");
    });
    return doStub(this.env, appId).execBatch(items) as Promise<T[]>;
  }

  exec(query: string) {
    const appId = this.#assertScope();
    return doStub(this.env, appId).execScript(query);
  }

  pingScope(): {
    appId: string;
    ok: true;
    backend: "do-sqlite";
  } {
    return { appId: this.#assertScope(), ok: true, backend: "do-sqlite" };
  }
}
