/**
 * Standalone entry: `/api` → Hono, everything else → the SPA assets.
 *
 * The factory does not use this file. There the host serves the client
 * bundle and builds its own entry around `app` from `./server`; this exists
 * so the template runs on its own under `wrangler dev`.
 */
import type { Env } from "./env";
import { app } from "./server";

export default {
  fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
