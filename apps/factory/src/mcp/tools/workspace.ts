import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appAgent, type McpContext } from "@/mcp/lib/context.js";
import {
  isPlatformReadonlyPath,
  PlatformReadonlyError,
} from "../../agent/platform-readonly.js";
import { toolError, toolResult } from "../lib/tool-result.js";

const appId = z.string().describe("App id the workspace belongs to");
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
    "workspace_ls",
    {
      description:
        "List a workspace directory. Start at / to see the app's tree.",
      inputSchema: {
        appId,
        path: z.string().default("/").describe("Directory path. Defaults to /"),
      },
    },
    async ({ appId: id, path: dir }) => {
      const agent = await appAgent(ctx.env, id);
      const entries = await agent.readDir(dir);
      return toolResult({ path: dir, entries });
    }
  );

  server.registerTool(
    "workspace_read",
    {
      description: "Read a workspace file. Returns null content if absent.",
      inputSchema: { appId, path },
    },
    async ({ appId: id, path: file }) => {
      const agent = await appAgent(ctx.env, id);
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
      inputSchema: { appId, path, content: z.string() },
    },
    async ({ appId: id, path: file, content }) => {
      if (isPlatformReadonlyPath(file)) {
        return toolError("read_only", { path: file });
      }
      const agent = await appAgent(ctx.env, id);
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
        path,
        recursive: z.boolean().default(false),
      },
    },
    async ({ appId: id, path: target, recursive }) => {
      if (isPlatformReadonlyPath(target)) {
        return toolError("read_only", { path: target });
      }
      const agent = await appAgent(ctx.env, id);
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
        pattern: z.string().describe("Glob pattern, e.g. src/**/*.ts"),
      },
    },
    async ({ appId: id, pattern }) => {
      const agent = await appAgent(ctx.env, id);
      const paths = await agent.glob(pattern);
      return toolResult({ pattern, paths });
    }
  );
}
