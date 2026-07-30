import type { ProtectedReply } from "../../hono/reply.js";
import type { SqlBody } from "../../hono/schemas.js";
import { liveAppDataStub } from "../../registry/app-stub.js";
import type { AppCtx } from "../../serve/routes.js";

export async function handleSql(
  rc: AppCtx,
  body: SqlBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const db = liveAppDataStub(rc.env, appId) as unknown as {
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
      dataId: string;
      ok: true;
      backend: "do-sqlite";
    }>;
  };
  const ping = await db.pingScope();
  const result = await db
    .prepare(body.query)
    .bind(...(body.binds ?? []))
    .all();
  return { status: 200, body: { ok: true as const, appId, ping, result } };
}
