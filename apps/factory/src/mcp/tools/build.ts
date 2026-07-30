import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { appAgent, type McpContext } from "@/mcp/lib/context.js";
import { toolResult } from "../lib/tool-result.js";

const appId = z.string().describe("App id to run against");
const workspaceId = z
  .string()
  .optional()
  .describe("Workspace id (ws_…). Omit to use the app's default workspace.");

/**
 * The publish loop, as the agent runs it.
 *
 * Each tool executes the real shell command through the same bash tool and the
 * same `createAppShellCommands` a model turn drives — there is one
 * implementation of `pnpm typecheck`, not an MCP copy of it. Named tools rather
 * than a raw script parameter, so the surface stays self-describing for whoever
 * is driving it.
 */
export function registerBuildTools(server: McpServer, ctx: McpContext): void {
  const run = async (id: string, script: string, wsId?: string) => {
    const agent = await appAgent(ctx.env, id, wsId);
    const result = await agent.runShell(script);
    // Not `toolError` on a non-zero exit: a failing typecheck is the answer the
    // caller asked for, not a broken call.
    return toolResult({ script, ...result, passed: result.exitCode === 0 });
  };

  server.registerTool(
    "app_typecheck",
    {
      description:
        "Typecheck the workspace via the check worker. tsc-style diagnostics " +
        "on stdout; exitCode 0 means clean.",
      inputSchema: { appId, workspaceId },
    },
    ({ appId: id, workspaceId: wsId }) => run(id, "pnpm typecheck", wsId)
  );

  server.registerTool(
    "app_lint",
    {
      description:
        "Lint the workspace via the lint worker. Set fix to also write " +
        "formatting fixes back into the workspace.",
      inputSchema: { appId, workspaceId, fix: z.boolean().default(false) },
    },
    ({ appId: id, workspaceId: wsId, fix }) =>
      run(id, fix ? "pnpm lint --fix" : "pnpm lint", wsId)
  );

  server.registerTool(
    "app_db_generate",
    {
      description:
        "Derive the SQL migration for the workspace's current src/db/schema.ts " +
        "and write it to migrations/000N_<name>.sql. Required after a schema " +
        "change — deploy refuses a schema the database does not implement.",
      inputSchema: {
        appId,
        workspaceId,
        name: z
          .string()
          .describe("Migration name, e.g. add_transactions (snake_case)"),
      },
    },
    ({ appId: id, workspaceId: wsId, name }) =>
      run(id, `pnpm db:generate ${name}`, wsId)
  );

  server.registerTool(
    "app_deploy",
    {
      description:
        "Refused — main is merge-only. Push a feature branch, open a PR " +
        "(gh pr create), wait for checks, then gh pr merge.",
      inputSchema: { appId, workspaceId },
    },
    ({ appId: id, workspaceId: wsId }) => run(id, "pnpm run deploy", wsId)
  );

  server.registerTool(
    "app_seed",
    {
      description:
        "Create the demo organization and sample rows in the live app " +
        "(Northwind / WID-001), and print the demo login. Idempotent — " +
        "re-running returns the same credentials. Requires a live version.",
      inputSchema: { appId, workspaceId },
    },
    ({ appId: id, workspaceId: wsId }) => run(id, "pnpm seed", wsId)
  );
}
