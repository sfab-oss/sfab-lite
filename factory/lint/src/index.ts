/**
 * @sfab-lite/lint — Biome WASM lint worker.
 *
 * Thin HTTP shell: admin token + POST /lint → `@sfab-lite/verbs/lint`.
 */
import type { LintRequest } from "@sfab-lite/core";
import { bootBiome, runLint } from "@sfab-lite/verbs/lint";

export interface Env {
  ADMIN_TOKEN?: string;
}

/**
 * An unset `ADMIN_TOKEN` denies rather than allows — see the same correction
 * in `factory/check/src/index.ts`. A missing secret must not grant access.
 */
function unauthorized(env: Env, request: Request): Response | null {
  if (
    env.ADMIN_TOKEN &&
    request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN
  ) {
    return null;
  }
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
  const gated = unauthorized(env, request);
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
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = (await request.json()) as LintRequest;
    if (!body?.files || typeof body.files !== "object") {
      return Response.json(
        { ok: false, error: "body.files (path→content) required" },
        { status: 400 }
      );
    }
    if (!body.appId || typeof body.appId !== "string") {
      return Response.json(
        { ok: false, error: "body.appId required" },
        { status: 400 }
      );
    }
    return Response.json(runLint(body));
  } catch (e) {
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
