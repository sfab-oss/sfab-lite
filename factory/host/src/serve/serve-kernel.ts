/**
 * Serve client kernel chunks at /kernel/:version/client/:file
 *
 * Current KERNEL_VERSION is served from the Worker bundle (no R2 read).
 * Older versions that were uploaded to KERNEL_R2 are streamed from R2.
 * A version with no R2 manifest is still a 409; a known version whose
 * chunk object is missing is a 500 — those must not be conflated.
 */
import { CLIENT_KERNEL_FILES, KERNEL_VERSION } from "@sfab-lite/kernel";

const KERNEL_CHUNK_PATH_RE = /^([^/]+)\/(?:client\/)?([^/]+\.js)$/;

const IMMUTABLE_JS = {
  "content-type": "application/javascript; charset=utf-8",
  "cache-control": "public, max-age=31536000, immutable",
} as const;

function kernelManifestKey(version: string): string {
  return `kernels/${version}/manifest.json`;
}

function kernelChunkKey(version: string, file: string): string {
  return `kernels/${version}/client/${file}`;
}

function mismatch(requested: string): Response {
  return Response.json(
    {
      ok: false,
      error: "kernel_version_mismatch",
      requested,
      hostKernel: KERNEL_VERSION,
    },
    { status: 409 }
  );
}

function fromBundle(request: Request, file: string): Response {
  const body = CLIENT_KERNEL_FILES[file];
  if (body == null) {
    return new Response(`unknown kernel chunk: ${file}`, { status: 404 });
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: IMMUTABLE_JS });
  }
  return new Response(body, { status: 200, headers: IMMUTABLE_JS });
}

async function fromR2(
  request: Request,
  env: Env,
  version: string,
  file: string
): Promise<Response> {
  const manifest = await env.KERNEL_R2.head(kernelManifestKey(version));
  if (!manifest) {
    return mismatch(version);
  }

  const key = kernelChunkKey(version, file);
  if (request.method === "HEAD") {
    const meta = await env.KERNEL_R2.head(key);
    if (!meta) {
      return Response.json(
        {
          ok: false,
          error: "kernel_chunk_missing",
          version,
          file,
        },
        { status: 500 }
      );
    }
    return new Response(null, { status: 200, headers: IMMUTABLE_JS });
  }

  const object = await env.KERNEL_R2.get(key);
  if (!object) {
    return Response.json(
      {
        ok: false,
        error: "kernel_chunk_missing",
        version,
        file,
      },
      { status: 500 }
    );
  }

  return new Response(object.body, { status: 200, headers: IMMUTABLE_JS });
}

export async function serveKernel(
  request: Request,
  restPath: string,
  env: Env
): Promise<Response | null> {
  const m = restPath.match(KERNEL_CHUNK_PATH_RE);
  if (!m) {
    return null;
  }
  const ver = decodeURIComponent(m[1] ?? "");
  const file = m[2] ?? "";

  if (ver === KERNEL_VERSION) {
    return fromBundle(request, file);
  }

  return await fromR2(request, env, ver, file);
}
