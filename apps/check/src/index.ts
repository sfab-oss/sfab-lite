/**
 * @sfab-lite/check — TypeScript LanguageService check worker.
 *
 * Stateless Worker (per-isolate LS cache): POST /check with app sources
 * against the frozen kernel types VFS; returns diagnostics.
 */
import type { CheckRequest } from "@sfab-lite/core";
import { TYPES_VFS_MANIFEST } from "@sfab-lite/kernel";
import { runCheck } from "./run-check.js";

export interface Env {
  ADMIN_TOKEN?: string;
}

function unauthorized(env: Env, request: Request): Response | null {
  if (!env.ADMIN_TOKEN) {
    return null;
  }
  if (request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN) {
    return null;
  }
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function healthResponse(): Response {
  return Response.json({
    ok: true,
    service: "sfab-lite-check",
    role: "check-worker",
    vfsFiles: TYPES_VFS_MANIFEST.vfsFileCount,
    vfsGzipBytes: TYPES_VFS_MANIFEST.vfsJsonGzipBytes,
    typescript: TYPES_VFS_MANIFEST.typescript,
    prune: TYPES_VFS_MANIFEST.prune,
  });
}

async function checkResponse(env: Env, request: Request): Promise<Response> {
  const gated = unauthorized(env, request);
  if (gated) {
    return gated;
  }
  try {
    const body = (await request.json()) as CheckRequest;
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
    return Response.json(runCheck(body));
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
      return healthResponse();
    }
    if (url.pathname === "/check" && request.method === "POST") {
      return await checkResponse(env, request);
    }

    return new Response("sfab-lite-check: GET /health | POST /check\n", {
      status: 404,
    });
  },
};
