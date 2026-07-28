import type { WorkspaceFileContent, WorkspaceFileEntry } from "../model/types";

const EXT_MIME: Record<string, string> = {
  css: "text/css",
  html: "text/html",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  mjs: "text/javascript",
  svg: "image/svg+xml",
  ts: "text/typescript",
  tsx: "text/typescript",
  txt: "text/plain",
};

function normalizeDir(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return "text/plain";
  }
  return EXT_MIME[path.slice(dot + 1).toLowerCase()] ?? "text/plain";
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
