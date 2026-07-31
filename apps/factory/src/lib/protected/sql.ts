import { createDb } from "../../db/index.js";
import type { ProtectedReply } from "../../hono/reply.js";
import type { SqlBody } from "../../hono/schemas.js";
import { serveTargetAppDataStub } from "../../registry/app-stub.js";
import type { ServeTarget } from "../../registry/serve-target.js";
import { workspaceBelongsToApp } from "../../registry/workspace-registry.js";
import type { AppCtx } from "../../serve/routes.js";

function resolveSqlTarget(
  appId: string,
  body: SqlBody
): ServeTarget | { error: string } {
  const kind = body.target ?? "live";
  if (kind === "live") {
    return { mode: "live", appId };
  }
  if (kind === "workspace") {
    if (!body.workspaceId) {
      return { error: "workspaceId required when target is workspace" };
    }
    return { mode: "workspace", workspaceId: body.workspaceId };
  }
  if (body.prNumber == null) {
    return { error: "prNumber required when target is preview" };
  }
  return { mode: "preview", appId, prNumber: body.prNumber };
}

export async function handleSql(
  rc: AppCtx,
  body: SqlBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const target = resolveSqlTarget(appId, body);
  if ("error" in target) {
    return { status: 400, body: { ok: false as const, error: target.error } };
  }

  if (target.mode === "workspace") {
    const belongs = await workspaceBelongsToApp(
      createDb(rc.env),
      appId,
      target.workspaceId
    );
    if (!belongs) {
      return {
        status: 404,
        body: {
          ok: false as const,
          error: "workspace_not_found",
          workspaceId: target.workspaceId,
        },
      };
    }
  }

  const db = serveTargetAppDataStub(rc.env, target) as unknown as {
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
  return {
    status: 200,
    body: {
      ok: true as const,
      appId,
      target,
      ping,
      result,
    },
  };
}
