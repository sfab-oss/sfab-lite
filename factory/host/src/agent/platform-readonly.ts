/**
 * Factory-owned write policy for seeded platform chrome.
 *
 * The template ships ordinary root files (tsconfig, biome, components.json,
 * vite.config, package.json, index.html). This module — not the template
 * manifest — decides they are not writable on the host FS (GatedWorkspace,
 * MCP workspace_write/rm, lint format write-back, bash sync via the same
 * surface). `src/generated/**` is prefix-readonly for the same reason.
 *
 * Host persist of generated members uses `writeGenerated`, which does not
 * consult this policy. That is a bypass for the host, not a hole agents can
 * walk through.
 */
const PLATFORM_READONLY_PATHS = [
  "tsconfig.json",
  "biome.json",
  "components.json",
  "vite.config.ts",
  "package.json",
  "index.html",
  "src/db/index.ts",
] as const;

const GENERATED_PREFIX = "src/generated";

const READONLY = new Set<string>(PLATFORM_READONLY_PATHS);
const LEADING_SLASHES = /^\/+/;

/**
 * Canonical workspace-relative path for deny matching.
 * Strips leading slashes, collapses `.` / `..` (POSIX: `..` at root is a no-op).
 */
export function normalizeWorkspaceRelPath(path: string): string {
  const raw = path.replace(LEADING_SLASHES, "");
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length > 0) {
        parts.pop();
      }
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function platformReadonlyPaths(): readonly string[] {
  return [...PLATFORM_READONLY_PATHS].sort();
}

function isGeneratedPrefixPath(path: string): boolean {
  const rel = normalizeWorkspaceRelPath(path);
  return rel === GENERATED_PREFIX || rel.startsWith(`${GENERATED_PREFIX}/`);
}

const HOST_GENERATED_ROOTS = new Set([
  "package.json",
  "tsconfig.json",
  "index.html",
  "components.json",
  "src/db/index.ts",
]);

export function isHostGeneratedPath(path: string): boolean {
  const rel = normalizeWorkspaceRelPath(path);
  return HOST_GENERATED_ROOTS.has(rel) || isGeneratedPrefixPath(rel);
}

export function isPlatformReadonlyPath(path: string): boolean {
  const rel = normalizeWorkspaceRelPath(path);
  return READONLY.has(rel) || isGeneratedPrefixPath(rel);
}

export class PlatformReadonlyError extends Error {
  readonly path: string;

  constructor(path: string) {
    const rel = normalizeWorkspaceRelPath(path);
    super(`read-only: ${rel} is platform-owned and cannot be modified`);
    this.name = "PlatformReadonlyError";
    this.path = rel;
  }
}

export function assertWritableWorkspacePath(path: string): void {
  if (isPlatformReadonlyPath(path)) {
    throw new PlatformReadonlyError(path);
  }
}

export class GeneratedPathError extends Error {
  readonly path: string;

  constructor(path: string) {
    const rel = normalizeWorkspaceRelPath(path);
    super(`writeGenerated: ${rel} is not a generated format member`);
    this.name = "GeneratedPathError";
    this.path = rel;
  }
}

export function assertHostGeneratedPath(path: string): void {
  if (!isHostGeneratedPath(path)) {
    throw new GeneratedPathError(path);
  }
}
