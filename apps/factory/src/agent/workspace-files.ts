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

export interface AgentWorkspaceFs {
  glob: (pattern: string) => Promise<Array<{ path: string; type: string }>>;
  readFile: (path: string) => Promise<string | null>;
}

/**
 * Snapshot AppAgent workspace files as factory `sourceFiles` (no leading slash).
 */
export async function collectAgentWorkspaceFiles(
  fs: AgentWorkspaceFs
): Promise<Record<string, string>> {
  const found = await fs.glob("**/*");
  const files: Record<string, string> = {};
  for (const entry of found) {
    if (entry.type !== "file") {
      continue;
    }
    const path = entry.path.startsWith("/") ? entry.path : `/${entry.path}`;
    if (!shouldCollect(path)) {
      continue;
    }
    const content = await fs.readFile(path);
    if (content == null) {
      continue;
    }
    files[toSourcePath(path)] = content;
  }
  return files;
}
