import type { ProtectedReply } from "../../hono/reply.js";
import type { SqlBody } from "../../hono/schemas.js";
import type { AppCtx } from "../../routes.js";
import type { ScopedSqlProps } from "../../scoped-sql.js";

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

export async function handleSql(
  rc: AppCtx,
  body: SqlBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const db = scopedDb(rc.ctx, appId);
  const ping = await db.pingScope();
  const result = await db
    .prepare(body.query)
    .bind(...(body.binds ?? []))
    .all();
  return { status: 200, body: { ok: true as const, appId, ping, result } };
}
