/**
 * Throwaway worker `sfab-lite-check-exp`. Not the product check worker.
 * Every route, including /health, fails closed without ADMIN_TOKEN.
 */
import { BAKED_API_DTS } from "./baked-api-dts.ts";
import { isProgramName, PROGRAMS, runProgram } from "./programs.ts";

const EXP_PATH = /^\/exp\/([^/]+)$/;

export interface Env {
  ADMIN_TOKEN?: string;
}

function unauthorized(env: Env, request: Request): Response | null {
  if (
    env.ADMIN_TOKEN &&
    request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN
  ) {
    return null;
  }
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export default {
  fetch(request: Request, env: Env): Response {
    const url = new URL(request.url);
    const gated = unauthorized(env, request);
    if (gated) {
      return gated;
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "sfab-lite-check-exp",
        programs: PROGRAMS,
      });
    }

    const match = EXP_PATH.exec(url.pathname);
    if (match && request.method === "POST") {
      const name = match[1] ?? "";
      if (!isProgramName(name)) {
        return Response.json(
          { ok: false, error: "unknown program", programs: PROGRAMS },
          { status: 404 }
        );
      }
      const runId = url.searchParams.get("run") ?? crypto.randomUUID();
      console.log(JSON.stringify({ exp: name, runId }));
      const result = runProgram(name, BAKED_API_DTS);
      return Response.json({ ok: true, runId, ...result });
    }

    return new Response(
      "sfab-lite-check-exp: GET /health | POST /exp/<program>?run=\n",
      { status: 404 }
    );
  },
};
