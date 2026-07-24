/**
 * Serve client kernel chunks at /kernel/:version/client/:file
 */
import { CLIENT_KERNEL_FILES, KERNEL_VERSION } from "@sfab-lite/kernel";

export function serveKernel(
  request: Request,
  restPath: string
): Response | null {
  const m = restPath.match(/^([^/]+)\/(?:client\/)?([^/]+\.js)$/);
  if (!m) {
    return null;
  }
  const ver = decodeURIComponent(m[1] ?? "");
  const file = m[2] ?? "";
  if (ver !== KERNEL_VERSION) {
    return Response.json(
      {
        ok: false,
        error: "kernel_version_mismatch",
        requested: ver,
        hostKernel: KERNEL_VERSION,
      },
      { status: 409 }
    );
  }
  const body = CLIENT_KERNEL_FILES[file];
  if (body == null) {
    return new Response(`unknown kernel chunk: ${file}`, { status: 404 });
  }
  const headers = {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
  };
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}
