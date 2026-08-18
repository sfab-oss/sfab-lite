/**
 * Client-tree classification prefixes for check (isClientAppPath).
 *
 * Kept free of relative `.js` imports so `node:test` + strip-types can load it.
 * resolve-modules re-exports these for the rest of the check graph.
 */
import type { ManifestV0 } from "@sfab-lite/core";

const LEADING_SLASHES = /^\/+/;
const MULTI_SLASH = /\/{2,}/g;

/**
 * RFC §2 client tree: the client entry, its stylesheet, routeTree.gen.ts
 * (sibling of client.entry), and `src/{routes,components,hooks,lib}/`.
 * Everything else under `src/` is server-side.
 */
const RFC_CLIENT_DIRS = ["routes", "components", "hooks", "lib"] as const;

function normalizeAppPath(path: string): string {
  let p = path.replaceAll("\\", "/");
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  return p.replace(MULTI_SLASH, "/");
}

export function clientPrefixesFromManifest(
  manifest: ManifestV0
): readonly string[] {
  const clientEntry = normalizeAppPath(
    `/app/${manifest.client.entry.replace(LEADING_SLASHES, "")}`
  );
  const entryDir = clientEntry.slice(0, clientEntry.lastIndexOf("/") + 1);
  return [
    clientEntry,
    normalizeAppPath(
      `/app/${manifest.client.styles.replace(LEADING_SLASHES, "")}`
    ),
    normalizeAppPath(`${entryDir}routeTree.gen.ts`),
    ...RFC_CLIENT_DIRS.map((dir) => `${normalizeAppPath(`/app/src/${dir}`)}/`),
  ];
}

export function isClientAppPath(
  path: string | undefined,
  prefixes: readonly string[]
): boolean {
  if (path == null) {
    return false;
  }
  const n = normalizeAppPath(path);
  return prefixes.some((prefix) =>
    prefix.endsWith("/") ? n.startsWith(prefix) : n === prefix
  );
}
