/**
 * Factory-owned write policy for seeded platform chrome.
 *
 * The template ships ordinary root files (tsconfig, biome, components.json,
 * vite.config). This module — not the template manifest — decides they are
 * not writable on the host FS (GatedWorkspace, MCP workspace_write/rm, lint
 * format write-back, bash sync via the same surface).
 */
const PLATFORM_READONLY_PATHS = [
  "tsconfig.json",
  "biome.json",
  "components.json",
  "vite.config.ts",
] as const;

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

export function isPlatformReadonlyPath(path: string): boolean {
  return READONLY.has(normalizeWorkspaceRelPath(path));
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
