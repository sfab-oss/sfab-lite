import type { CommandContext } from "just-bash";

const EXCLUDED_ROOTS = ["/bin", "/usr", "/dev", "/proc", "/sys"];

function shouldCollect(path: string): boolean {
  if (path === "/" || path === "/tmp" || path.startsWith("/tmp/")) {
    return false;
  }
  return !EXCLUDED_ROOTS.some(
    (root) => path === root || path.startsWith(`${root}/`)
  );
}

function toSourcePath(abs: string): string {
  return abs.startsWith("/") ? abs.slice(1) : abs;
}

/**
 * Snapshot the bash VFS as factory `sourceFiles` keys (no leading slash).
 * Skips synthetic shell roots that must never enter a version.
 */
export async function collectWorkspaceSourceFiles(
  ctx: CommandContext
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const raw of ctx.fs.getAllPaths()) {
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    if (!shouldCollect(path)) {
      continue;
    }
    const stat = await ctx.fs.stat(path).catch(() => null);
    if (!stat?.isFile) {
      continue;
    }
    const content = await ctx.fs.readFile(path);
    files[toSourcePath(path)] = content;
  }
  return files;
}
