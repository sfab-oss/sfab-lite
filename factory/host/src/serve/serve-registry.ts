import catalogJson from "@sfab-lite/registry/catalog" with { type: "json" };
import {
  type Catalog,
  catalogNameForSlug,
  toBuiltRegistryItem,
} from "@sfab-lite/registry/lite";

const CATALOG = catalogJson as Catalog;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300",
  "access-control-allow-origin": "*",
} as const;

/**
 * Public built registry items. Auth: none — AGPL source, same as a
 * public shadcn registry. Served from the bundled catalog; no R2, no DO.
 */
export function serveRegistryItem(request: Request, slug: string): Response {
  if (!SLUG_RE.test(slug)) {
    return Response.json(
      { ok: false, error: "unknown_item" },
      { status: 404, headers: HEADERS }
    );
  }
  const entry = CATALOG.items[catalogNameForSlug(slug)];
  if (!entry) {
    return Response.json(
      { ok: false, error: "unknown_item" },
      { status: 404, headers: HEADERS }
    );
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: HEADERS });
  }
  const body = `${JSON.stringify(toBuiltRegistryItem(entry), null, 2)}\n`;
  return new Response(body, { status: 200, headers: HEADERS });
}
