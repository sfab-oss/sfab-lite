/**
 * @sfab-lite/build — in-worker compile worker.
 *
 * Thin HTTP shell: admin token + POST /build | /bundle → `@sfab-lite/verbs/build`.
 */
import { parseBuildRequest, parseBundleRequest } from "@sfab-lite/core/build";
import { InvalidRequestError } from "@sfab-lite/core/request";
import { build, bundleWithKernel } from "@sfab-lite/verbs/build";

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
    service: "sfab-lite-build",
    role: "build-worker",
    adminToken: {
      configured: Boolean(env.ADMIN_TOKEN),
      matchesCaller:
        Boolean(env.ADMIN_TOKEN) &&
        request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN,
    },
  });
}

function failureResponse(e: unknown): Response {
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

async function buildResponse(env: Env, request: Request): Promise<Response> {
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = parseBuildRequest(await request.json());
    const result = await build(body);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return failureResponse(e);
  }
}

async function bundleResponse(env: Env, request: Request): Promise<Response> {
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = parseBundleRequest(await request.json());
    const result = await bundleWithKernel(
      body.files,
      body.entryPoint,
      body.extraExternals ?? []
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return failureResponse(e);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return healthResponse(env, request);
    }
    if (url.pathname === "/build" && request.method === "POST") {
      return await buildResponse(env, request);
    }
    if (url.pathname === "/bundle" && request.method === "POST") {
      return await bundleResponse(env, request);
    }

    return new Response(
      "sfab-lite-build: GET /health | POST /build | POST /bundle\n",
      { status: 404 }
    );
  },
};
