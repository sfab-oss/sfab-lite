import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTools } from "../tools/apps.js";
import { registerBashTools } from "../tools/bash.js";
import { registerWorkspaceTools } from "../tools/workspace.js";
import type { McpContext } from "./context.js";

/** A fresh server per request, scoped to one organization. */
export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: "sfab-lite", version: "0.1.0" });
  registerAppTools(server, ctx);
  registerWorkspaceTools(server, ctx);
  registerBashTools(server, ctx);
  return server;
}
