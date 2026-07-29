import { TEMPLATE_MANIFEST } from "@sfab-lite/template";

const LEADING_SLASHES = /^\/+/;

export function normalizeWorkspaceRelPath(path: string): string {
  return path.replace(LEADING_SLASHES, "");
}

const READONLY = new Set(
  (TEMPLATE_MANIFEST.readonly ?? []).map(normalizeWorkspaceRelPath)
);

export function platformReadonlyPaths(): readonly string[] {
  return [...READONLY].sort();
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
