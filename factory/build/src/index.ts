/**
 * @sfab-lite/build — in-worker compile worker.
 *
 * Thin HTTP shell: admin token + POST /build | /bundle → `@sfab-lite/verbs/build`.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import {
  build,
  bundleWithKernel,
} from "@sfab-lite/verbs/build";
import type { OverlaidTree } from "@sfab-lite/verbs/format";

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

function isFilesRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== "string") {
      return false;
    }
  }
  return true;
}

async function buildResponse(env: Env, request: Request): Promise<Response> {
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = (await request.json()) as {
      files?: unknown;
      manifest?: unknown;
    };
    if (!isFilesRecord(body?.files)) {
      return Response.json(
        { ok: false, error: "body.files (path→content) required" },
        { status: 400 }
      );
    }
    if (!body.manifest || typeof body.manifest !== "object") {
      return Response.json(
        { ok: false, error: "body.manifest required" },
        { status: 400 }
      );
    }
    const tree: OverlaidTree = {
      files: body.files,
      manifest: body.manifest as ManifestV0,
    };
    const result = await build(tree);
    return Response.json({ ok: true, ...result });
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

async function bundleResponse(env: Env, request: Request): Promise<Response> {
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = (await request.json()) as {
      files?: unknown;
      entryPoint?: unknown;
      extraExternals?: unknown;
    };
    if (!isFilesRecord(body?.files)) {
      return Response.json(
        { ok: false, error: "body.files (path→content) required" },
        { status: 400 }
      );
    }
    if (typeof body.entryPoint !== "string" || body.entryPoint === "") {
      return Response.json(
        { ok: false, error: "body.entryPoint required" },
        { status: 400 }
      );
    }
    let extraExternals: string[] = [];
    if (body.extraExternals !== undefined) {
      if (
        !Array.isArray(body.extraExternals) ||
        body.extraExternals.some((item) => typeof item !== "string")
      ) {
        return Response.json(
          { ok: false, error: "body.extraExternals must be string[]" },
          { status: 400 }
        );
      }
      extraExternals = body.extraExternals;
    }
    const result = await bundleWithKernel(
      body.files,
      body.entryPoint,
      extraExternals
    );
    return Response.json({ ok: true, ...result });
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
