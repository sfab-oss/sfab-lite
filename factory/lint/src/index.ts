/**
 * @sfab-lite/lint — Biome WASM lint worker.
 *
 * Thin HTTP shell: admin token + POST /lint → `@sfab-lite/verbs/lint`.
 */
import { parseLintRequest } from "@sfab-lite/core/lint";
import {
  InvalidRequestError,
  rejectUnlessAdmin,
} from "@sfab-lite/core/request";
import { bootBiome, runLint } from "@sfab-lite/verbs/lint";

export interface Env {
  ADMIN_TOKEN?: string;
}

/** `adminToken` mirrors the check worker's — see its note on why booleans. */
function healthResponse(env: Env, request: Request): Response {
  return Response.json({
    ok: true,
    service: "sfab-lite-lint",
    role: "lint-worker",
    adminToken: {
      configured: Boolean(env.ADMIN_TOKEN),
      matchesCaller:
        Boolean(env.ADMIN_TOKEN) &&
        request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN,
    },
    wasmPath: "wasm-web-initSync",
  });
}

function bootResponse(env: Env, request: Request): Response {
  const gated = rejectUnlessAdmin(request, env);
  if (gated) {
    return gated;
  }
  const attempt = bootBiome();
  return Response.json({
    ok: attempt.ok,
    service: "sfab-lite-lint",
    attempts: { wasmWebInitSync: attempt },
  });
}

async function lintResponse(env: Env, request: Request): Promise<Response> {
  const gated = rejectUnlessAdmin(request, env);
  if (gated) {
    return gated;
  }
  try {
    const body = parseLintRequest(await request.json());
    return Response.json(runLint(body));
  } catch (e) {
    if (e instanceof InvalidRequestError) {
      return Response.json({ ok: false, error: e.message }, { status: 400 });
    }
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return healthResponse(env, request);
    }
    if (url.pathname === "/boot") {
      return bootResponse(env, request);
    }
    if (url.pathname === "/lint" && request.method === "POST") {
      return await lintResponse(env, request);
    }

    return new Response("sfab-lite-lint: GET /health | /boot | POST /lint\n", {
      status: 404,
    });
  },
};
