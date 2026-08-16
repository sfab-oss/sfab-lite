/**
 * @sfab-lite/check — TypeScript LanguageService check worker.
 *
 * Thin HTTP shell: admin token + POST /check → `@sfab-lite/verbs/check`.
 */
import type { CheckRequest } from "@sfab-lite/core";
import { TYPES_VFS_MANIFEST } from "@sfab-lite/kernel";
import { runCheck } from "@sfab-lite/verbs/check";

export interface Env {
  ADMIN_TOKEN?: string;
}

/**
 * An unset `ADMIN_TOKEN` denies rather than allows.
 *
 * This used to return `null` — allowed — when the secret was missing, so a
 * deploy that forgot it exposed `/check` to anyone who found the worker's URL.
 * A missing secret must never be the thing that grants access; the factory's
 * own gate made this same correction.
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

/**
 * `adminToken` is what makes the four workers' shared secret checkable.
 *
 * It reports only two booleans about the *caller's* header — never the value,
 * and never a digest of it. `matchesCaller` is no more of an oracle than
 * `POST /check` already is, and it turns "do factory, check, lint and build agree?"
 * into one question the factory's `/api/protected/health` can ask directly, instead of
 * a `lintHttp: 401` mid-commit that names the wrong component.
 */
function healthResponse(env: Env, request: Request): Response {
  return Response.json({
    ok: true,
    service: "sfab-lite-check",
    role: "check-worker",
    adminToken: {
      configured: Boolean(env.ADMIN_TOKEN),
      matchesCaller:
        Boolean(env.ADMIN_TOKEN) &&
        request.headers.get("X-Admin-Token") === env.ADMIN_TOKEN,
    },
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
    if (!body.manifest || typeof body.manifest !== "object") {
      return Response.json(
        { ok: false, error: "body.manifest required" },
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
      return healthResponse(env, request);
    }
    if (url.pathname === "/check" && request.method === "POST") {
      return await checkResponse(env, request);
    }

    return new Response("sfab-lite-check: GET /health | POST /check\n", {
      status: 404,
    });
  },
};
