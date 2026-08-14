import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type McpContext,
  orgQuery,
  protectedFetch,
} from "@/mcp/lib/context.js";
import { toolError, toolResult } from "../lib/tool-result.js";

const appId = z
  .string()
  .describe("App id, e.g. app_01KYK1TEW0MXDKG87M3XZ2HQJD");

/** Admin routes answer `{ok:false,error}` on refusal; keep that as the result. */
function passThrough(res: { status: number; body: unknown }) {
  if (res.status >= 400) {
    const error =
      (res.body as { error?: string } | null)?.error ?? `http_${res.status}`;
    return toolError(error, { status: res.status });
  }
  return toolResult((res.body ?? {}) as Record<string, unknown>);
}

/**
 * Apps as objects — create, list, destroy. Deliberately the half the in-app
 * agent does not get: it is constructed with an appId and has no concept of
 * an app's existence, only of its contents.
 */
export function registerAppTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "apps_create",
    {
      description:
        "Create an app from the starter-lite template and wait for the create " +
        "attempt to be scheduled. Returns immediately with status `creating` — " +
        "poll `apps_get` until status is `ready` or `failed` (typically 25-40s).",
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe("App name. Omitted picks a generated one."),
      },
    },
    async ({ name }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "POST",
          `/api/protected/apps${orgQuery(ctx)}`,
          name === undefined ? {} : { name }
        )
      )
  );

  server.registerTool(
    "apps_list",
    {
      description: "List every app in the organization with its status.",
      inputSchema: {},
    },
    async () =>
      passThrough(
        await protectedFetch(ctx, "GET", `/api/protected/apps${orgQuery(ctx)}`)
      )
  );

  server.registerTool(
    "apps_get",
    {
      description:
        "One app: status, name, live version id. Poll this after apps_create.",
      inputSchema: { appId },
    },
    async ({ appId: id }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "GET",
          `/api/protected/apps/${encodeURIComponent(id)}`
        )
      )
  );

  server.registerTool(
    "apps_delete",
    {
      description:
        "Delete an app: registry row, Durable Object state, and workspace. " +
        "Not reversible.",
      inputSchema: { appId },
    },
    async ({ appId: id }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "DELETE",
          `/api/protected/apps/${encodeURIComponent(id)}`
        )
      )
  );

  server.registerTool(
    "apps_attempts",
    {
      description:
        "Commit/create attempts for an app, newest first. The payload of a " +
        "failed attempt carries the check and lint diagnostics that failed it.",
      inputSchema: { appId },
    },
    async ({ appId: id }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "GET",
          `/api/protected/apps/${encodeURIComponent(id)}/attempts`
        )
      )
  );

  server.registerTool(
    "apps_add",
    {
      description:
        "Copy an @lite registry recipe into the app workspace and record " +
        "provenance on manifest.recipes. Bare names are a hard error. " +
        "Re-adding overwrites target files; the PR diff is the review surface.",
      inputSchema: {
        appId,
        name: z
          .string()
          .describe("Recipe name, e.g. @lite/field or lite/field."),
        workspaceId: z
          .string()
          .optional()
          .describe("Workspace id (ws_…). Omit to use the app's default."),
      },
    },
    async ({ appId: id, name, workspaceId }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "POST",
          `/api/protected/apps/${encodeURIComponent(id)}/add`,
          workspaceId === undefined ? { name } : { name, workspaceId }
        )
      )
  );

  server.registerTool(
    "apps_live",
    {
      description:
        "The app's live version: id and source file list. This is what the " +
        "workspace was seeded from, and what a merged PR replaces.",
      inputSchema: { appId },
    },
    async ({ appId: id }) =>
      passThrough(
        await protectedFetch(
          ctx,
          "GET",
          `/api/protected/apps/${encodeURIComponent(id)}/live`
        )
      )
  );
}
