/**
 * Read paths against the per-app overlay and the frozen kernel types VFS.
 */
import { TYPES_VFS } from "@sfab-lite/kernel";

const D_TS_SUFFIX = /\.d\.ts$/i;
const TRAILING_SLASH = /\/$/;

/** Frozen VFS directory prefixes — TYPES_VFS never changes at runtime. */
const VFS_DIRECTORIES: ReadonlySet<string> = (() => {
  const dirs = new Set<string>([
    "/",
    "/libs",
    "/app",
    "/node_modules",
    "/types",
  ]);
  for (const key of Object.keys(TYPES_VFS)) {
    let rest = key.startsWith("/") ? key.slice(1) : key;
    while (rest.includes("/")) {
      rest = rest.slice(0, rest.lastIndexOf("/"));
      dirs.add(rest ? `/${rest}` : "/");
    }
  }
  return dirs;
})();

export function normalizePath(path: string): string {
  let p = path.replaceAll("\\", "/");
  if (p.startsWith("file://")) {
    p = p.slice("file://".length);
  }
  const q = p.indexOf("?");
  if (q >= 0) {
    p = p.slice(0, q);
  }
  return p;
}

function remapLibPath(path: string, overlay: Map<string, string>): string {
  const n = normalizePath(path);
  if (!n.startsWith("/libs/")) {
    return n;
  }
  const base = n.slice("/libs/".length);
  if (base.startsWith("lib.")) {
    return n;
  }
  const name = base.replace(D_TS_SUFFIX, "");
  const candidate = `/libs/lib.${name.toLowerCase()}.d.ts`;
  if (overlay.has(candidate) || TYPES_VFS[candidate] != null) {
    return candidate;
  }
  return n;
}

export function readVfs(
  path: string,
  overlay: Map<string, string>
): string | undefined {
  const norm = remapLibPath(path, overlay);
  if (overlay.has(norm)) {
    return overlay.get(norm);
  }
  if (TYPES_VFS[norm] != null) {
    return TYPES_VFS[norm];
  }
  if (!norm.startsWith("/") && TYPES_VFS[`/${norm}`] != null) {
    return TYPES_VFS[`/${norm}`];
  }
}

export function joinPath(dir: string, rel: string): string {
  const parts = (dir + rel).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") {
      continue;
    }
    if (p === "..") {
      out.pop();
    } else {
      out.push(p);
    }
  }
  return `/${out.join("/")}`;
}

function overlayHasDirectory(
  dir: string,
  overlay: Map<string, string>
): boolean {
  const prefix = `${dir}/`;
  for (const k of overlay.keys()) {
    if (k.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

export function directoryExists(
  dir: string,
  overlay: Map<string, string>
): boolean {
  const d = normalizePath(dir).replace(TRAILING_SLASH, "");
  return VFS_DIRECTORIES.has(d) || overlayHasDirectory(d, overlay);
}
