import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  appAgent,
  type McpContext,
  protectedFetch,
} from "@/mcp/lib/context.js";
import {
  isPlatformReadonlyPath,
  PlatformReadonlyError,
} from "../../agent/platform-readonly.js";
import { toolError, toolResult } from "../lib/tool-result.js";

const appId = z.string().describe("App id the workspace belongs to");
const workspaceId = z
  .string()
  .optional()
  .describe("Workspace id (ws_…). Omit to use the app's default workspace.");
const path = z
  .string()
  .describe("Absolute workspace path, e.g. /src/db/schema.ts");

/**
 * The app's checked-out source, inside the AppAgent Durable Object.
 *
 * These call the very methods the agent's own file tools bottom out in —
 * `SharedWorkspace` forwards a thread's reads and writes to this same object —
 * so an edit made here is an edit the next `app_typecheck` and `app_deploy`
 * see. The workspace is a working copy: nothing here touches the live app
 * until a deploy promotes it.
 */
export function registerWorkspaceTools(
  server: McpServer,
  ctx: McpContext
): void {
  server.registerTool(
    "workspaces_list",
    {
      description:
        "List workspaces (computers) for an app: id, name, and which is default.",
      inputSchema: { appId },
    },
    async ({ appId: id }) => {
      const res = await protectedFetch(
        ctx,
        "GET",
        `/api/protected/apps/${encodeURIComponent(id)}/workspaces`
      );
      if (res.status >= 400) {
        const error =
          (res.body as { error?: string } | null)?.error ??
          `http_${res.status}`;
        return toolError(error, { status: res.status });
      }
      const body = res.body as {
        workspaces?: Array<{
          id: string;
          name: string;
          isDefault: boolean;
        }>;
      } | null;
      const workspaces = (body?.workspaces ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        isDefault: w.isDefault,
      }));
      return toolResult({ appId: id, workspaces });
    }
  );

  server.registerTool(
    "workspace_ls",
    {
      description:
        "List a workspace directory. Start at / to see the app's tree.",
      inputSchema: {
        appId,
        workspaceId,
        path: z.string().default("/").describe("Directory path. Defaults to /"),
      },
    },
    async ({ appId: id, workspaceId: wsId, path: dir }) => {
      const agent = await appAgent(ctx.env, id, wsId);
      const entries = await agent.readDir(dir);
      return toolResult({ path: dir, entries });
    }
  );

  server.registerTool(
    "workspace_read",
    {
      description: "Read a workspace file. Returns null content if absent.",
      inputSchema: { appId, workspaceId, path },
    },
    async ({ appId: id, workspaceId: wsId, path: file }) => {
      const agent = await appAgent(ctx.env, id, wsId);
      const content = await agent.readFile(file);
      if (content === null) {
        return toolError("file_not_found", { path: file });
      }
      return toolResult({ path: file, content });
    }
  );

  server.registerTool(
    "workspace_write",
    {
      description:
        "Write a workspace file, creating or replacing it. Parent directories " +
        "are created. Platform-owned read-only roots (tsconfig, biome, " +
        "components.json, vite.config.ts) are refused. The change is visible " +
        "to app_typecheck and app_deploy immediately; it does not reach the " +
        "live app until app_deploy passes.",
      inputSchema: { appId, workspaceId, path, content: z.string() },
    },
    async ({ appId: id, workspaceId: wsId, path: file, content }) => {
      if (isPlatformReadonlyPath(file)) {
        return toolError("read_only", { path: file });
      }
      const agent = await appAgent(ctx.env, id, wsId);
      try {
        await agent.writeFile(file, content);
      } catch (e) {
        if (e instanceof PlatformReadonlyError) {
          return toolError("read_only", { path: e.path });
        }
        throw e;
      }
      return toolResult({ path: file, bytes: content.length });
    }
  );

  server.registerTool(
    "workspace_rm",
    {
      description:
        "Delete a workspace file or directory. Use recursive for a directory. " +
        "Platform-owned read-only roots are refused.",
      inputSchema: {
        appId,
        workspaceId,
        path,
        recursive: z.boolean().default(false),
      },
    },
    async ({ appId: id, workspaceId: wsId, path: target, recursive }) => {
      if (isPlatformReadonlyPath(target)) {
        return toolError("read_only", { path: target });
      }
      const agent = await appAgent(ctx.env, id, wsId);
      try {
        await agent.rm(target, { recursive });
      } catch (e) {
        if (e instanceof PlatformReadonlyError) {
          return toolError("read_only", { path: e.path });
        }
        throw e;
      }
      return toolResult({ path: target, removed: true });
    }
  );

  server.registerTool(
    "workspace_glob",
    {
      description:
        "Match workspace paths against a glob, e.g. src/**/*.tsx. Cheaper " +
        "than walking with workspace_ls.",
      inputSchema: {
        appId,
        workspaceId,
        pattern: z.string().describe("Glob pattern, e.g. src/**/*.ts"),
      },
    },
    async ({ appId: id, workspaceId: wsId, pattern }) => {
      const agent = await appAgent(ctx.env, id, wsId);
      const paths = await agent.glob(pattern);
      return toolResult({ pattern, paths });
    }
  );
}
