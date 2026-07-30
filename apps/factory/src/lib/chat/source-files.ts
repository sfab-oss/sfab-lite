import type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "@/lib/chat/types";
import { mimeFor } from "@/lib/workspace-files/mime";

function normalizeDir(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function dirEntries(
  sourceFiles: Record<string, string>,
  path: string
): { entries: WorkspaceFileEntry[]; path: string } {
  const dir = normalizeDir(path);
  const prefix = dir ? `${dir}/` : "";
  const names = new Map<string, WorkspaceFileEntry>();

  for (const filePath of Object.keys(sourceFiles)) {
    if (dir && !filePath.startsWith(prefix)) {
      continue;
    }
    const rest = dir ? filePath.slice(prefix.length) : filePath;
    if (!rest) {
      continue;
    }
    const slash = rest.indexOf("/");
    if (slash === -1) {
      names.set(rest, { name: rest, path: filePath, type: "file" });
      continue;
    }
    const name = rest.slice(0, slash);
    const childPath = dir ? `${dir}/${name}` : name;
    if (!names.has(name)) {
      names.set(name, { name, path: childPath, type: "directory" });
    }
  }

  const entries = [...names.values()].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return { entries, path: dir };
}

export function fileContent(
  sourceFiles: Record<string, string>,
  path: string
): WorkspaceFileContent | null {
  const content = sourceFiles[normalizeDir(path)];
  if (content == null) {
    return null;
  }
  const bytes = new TextEncoder().encode(content).byteLength;
  return {
    content,
    encoding: "text",
    mimeType: mimeFor(path),
    size: bytes,
  };
}
