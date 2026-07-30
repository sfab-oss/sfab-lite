import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appAgent, type McpContext } from "@/mcp/lib/context.js";
import { toolResult } from "../lib/tool-result.js";

const appId = z.string().describe("App id to run against");
const workspaceId = z
  .string()
  .optional()
  .describe("Workspace id (ws_…). Omit to use the app's default workspace.");
const command = z.string().describe("Shell script to run, e.g. pnpm typecheck");

/**
 * One MCP shell entrypoint. Runs through AppAgent.runShell — the same bash
 * table and createAppShellCommands a model turn drives.
 */
export function registerBashTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "bash",
    {
      description:
        "Run a shell command in the app workspace via the AppAgent shell " +
        "table (pnpm typecheck, pnpm lint, pnpm db:generate <name>, " +
        "pnpm seed, …). Non-zero exit is still a tool result (passed: false).",
      inputSchema: { appId, workspaceId, command },
    },
    async ({ appId: id, workspaceId: wsId, command: script }) => {
      const agent = await appAgent(ctx.env, id, wsId);
      const result = await agent.runShell(script);
      return toolResult({
        command: script,
        ...result,
        passed: result.exitCode === 0,
      });
    }
  );
}
