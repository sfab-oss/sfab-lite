/**
 * Server-tree hash (invariant 6) and route-module map for warm emit.
 *
 * Hash is sha256 of the server entry's import closure under `src/`, not the
 * client tree. The hash file's first line is that digest; extra lines are
 * per-file hexes so emit can re-run only changed route modules.
 */
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";
import { API_DTS, API_HASH } from "./generated-paths.js";
import { sha256Utf8Hex } from "./sha256.js";
import { normalizePath } from "./vfs.js";

const LEADING_SLASH = /^\//;
const RELATIVE_FROM = /(?:from\s+|import\s*\()\s*['"](\.[^'"]+)['"]/g;
const ROUTE_CALL = /\.route\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z_$][\w$]*)/g;
const HONO_EXPORT = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Hono/;
const HTTP_METHOD = /\.(get|post|patch|delete)\s*\(/;
const HAS_ROUTE = /\.route\s*\(/;
const AS_ALIAS = /\s+as\s+/;

const HASH_PREFIX = "sha256:";

export function overlayAppPath(rel: string): string {
  return normalizePath(`/app/${rel.replace(LEADING_SLASH, "")}`);
}

export function relFromOverlay(path: string): string {
  const n = normalizePath(path);
  return n.startsWith("/app/")
    ? n.slice("/app/".length)
    : n.replace(LEADING_SLASH, "");
}

function parseManifestEntries(files: Record<string, string>): {
  serverEntry: string;
} {
  const raw = files["manifest.json"];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        server?: { entry?: string };
      };
      if (parsed.server?.entry) {
        return { serverEntry: parsed.server.entry };
      }
    } catch {
      // Fall through to the template manifest.
    }
  }
  return { serverEntry: TEMPLATE_MANIFEST.server.entry };
}

export function serverEntryRel(files: Record<string, string>): string {
  return parseManifestEntries(files).serverEntry;
}

function overlayHas(overlay: Map<string, string>, path: string): boolean {
  return overlay.has(path);
}

function resolveRelative(
  fromFile: string,
  spec: string,
  overlay: Map<string, string>
): string | undefined {
  const dir = fromFile.slice(0, fromFile.lastIndexOf("/") + 1);
  const joined = normalizePath(dir + spec);
  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.d.ts`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
  ];
  for (const c of candidates) {
    if (overlayHas(overlay, c)) {
      return c;
    }
  }
}

function underSrc(path: string): boolean {
  return path.startsWith("/app/src/");
}

/** Import closure of the server entry, staying under `/app/src/`. */
export function serverImportClosure(
  overlay: Map<string, string>,
  entryRel: string
): string[] {
  const entry = overlayAppPath(entryRel);
  if (!overlay.has(entry)) {
    return [];
  }
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current) || !underSrc(current)) {
      continue;
    }
    seen.add(current);
    const text = overlay.get(current);
    if (text == null) {
      continue;
    }
    RELATIVE_FROM.lastIndex = 0;
    let m = RELATIVE_FROM.exec(text);
    while (m) {
      const spec = m[1];
      if (spec) {
        const resolved = resolveRelative(current, spec, overlay);
        if (resolved && underSrc(resolved) && !seen.has(resolved)) {
          stack.push(resolved);
        }
      }
      m = RELATIVE_FROM.exec(text);
    }
  }
  return [...seen].sort();
}

export function hashServerTree(
  overlay: Map<string, string>,
  closure: string[]
): { treeHash: string; fileHashes: Record<string, string> } {
  const fileHashes: Record<string, string> = {};
  const parts: string[] = [];
  for (const path of [...closure].sort()) {
    const rel = relFromOverlay(path);
    const text = overlay.get(path) ?? "";
    const hex = sha256Utf8Hex(text);
    fileHashes[rel] = hex;
    parts.push(`${rel}\0${text}`);
  }
  return {
    treeHash: `${HASH_PREFIX}${sha256Utf8Hex(parts.join("\n"))}`,
    fileHashes,
  };
}

export function formatHashFile(
  treeHash: string,
  fileHashes: Record<string, string>
): string {
  const lines = [treeHash];
  for (const rel of Object.keys(fileHashes).sort()) {
    lines.push(`${rel} ${fileHashes[rel]}`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseHashFile(text: string | undefined): {
  treeHash: string | undefined;
  fileHashes: Record<string, string>;
} {
  if (text == null || text === "") {
    return { treeHash: undefined, fileHashes: {} };
  }
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const treeHash = lines[0]?.startsWith(HASH_PREFIX) ? lines[0] : undefined;
  const fileHashes: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const sp = line.indexOf(" ");
    if (sp <= 0) {
      continue;
    }
    fileHashes[line.slice(0, sp)] = line.slice(sp + 1);
  }
  return { treeHash, fileHashes };
}

export function joinRoutePrefix(prefix: string, path: string): string {
  if (prefix === "/" || prefix === "") {
    return path.startsWith("/") ? path : `/${path}`;
  }
  if (path === "/" || path === "") {
    return prefix;
  }
  return `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseImports(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const named = /import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;
  let m = named.exec(text);
  while (m) {
    const spec = m[2];
    const names = m[1];
    if (spec && names) {
      for (const part of names.split(",")) {
        const local = part.trim().split(AS_ALIAS).pop()?.trim();
        if (local) {
          map.set(local, spec);
        }
      }
    }
    m = named.exec(text);
  }
  return map;
}

function parseRouteCalls(text: string): { prefix: string; ident: string }[] {
  const out: { prefix: string; ident: string }[] = [];
  ROUTE_CALL.lastIndex = 0;
  let m = ROUTE_CALL.exec(text);
  while (m) {
    const prefix = m[1];
    const ident = m[2];
    if (prefix != null && ident) {
      out.push({ prefix, ident });
    }
    m = ROUTE_CALL.exec(text);
  }
  return out;
}

export interface RouteModule {
  rel: string;
  overlayPath: string;
  prefix: string;
  exportName: string;
  isLeaf: boolean;
}

/**
 * Walk `.route("prefix", ident)` from the server entry to map each module
 * onto its mounted path prefix.
 */
export function routeModules(
  overlay: Map<string, string>,
  entryRel: string
): RouteModule[] {
  const entry = overlayAppPath(entryRel);
  if (!overlay.has(entry)) {
    return [];
  }
  const out: RouteModule[] = [];
  const seen = new Set<string>();
  const queue: Array<{ path: string; prefix: string }> = [
    { path: entry, prefix: "" },
  ];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    const text = overlay.get(item.path);
    if (text == null) {
      continue;
    }
    const exportMatch = HONO_EXPORT.exec(text);
    const exportName = exportMatch?.[1] ?? "default";
    const isLeaf = HTTP_METHOD.test(text) && !HAS_ROUTE.test(text);
    out.push({
      rel: relFromOverlay(item.path),
      overlayPath: item.path,
      prefix: item.prefix === "" ? "/" : item.prefix,
      exportName,
      isLeaf,
    });
    const imports = parseImports(text);
    for (const call of parseRouteCalls(text)) {
      const spec = imports.get(call.ident);
      if (!spec) {
        continue;
      }
      const resolved = resolveRelative(item.path, spec, overlay);
      if (!resolved) {
        continue;
      }
      const nextPrefix = joinRoutePrefix(item.prefix || "/", call.prefix);
      queue.push({ path: resolved, prefix: nextPrefix });
    }
  }
  return out;
}

export function generatedOverlayPath(artifact: "apiDts" | "apiHash"): string {
  return overlayAppPath(artifact === "apiDts" ? API_DTS : API_HASH);
}
