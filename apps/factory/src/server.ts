/**
 * Factory worker entry for TanStack Start + Cloudflare Vite.
 *
 * Host routes (/api, /agents, /a/, /kernel, /mcp, …) stay on the
 * existing dispatch; unmatched document paths fall through to Start.
 */
import handler from "@tanstack/react-start/server-entry";
import { dispatchFactoryRequest } from "./index.js";

export { CodemodeRuntime } from "@cloudflare/codemode";
export { AppAgent } from "./agent/app-agent.js";
export { AppThread } from "./agent/app-thread.js";
export { AppDO } from "./app-do.js";
export { ScopedSql } from "./scoped-sql.js";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const hit = await dispatchFactoryRequest(request, env, ctx);
    if (hit) {
      return hit;
    }
    return handler.fetch(request);
  },
};
