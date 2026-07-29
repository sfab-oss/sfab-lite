import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceFilesSource,
} from "@/features/workspace-files/types";

const ROOT = "/";
const MAX_PREVIEW_BYTES = 1_500_000;
const HIDDEN_ROOT_NAMES = new Set(["bin", "usr", "dev", "proc", "sys", "tmp"]);
const TRAILING_SLASHES = /\/+$/;

const TEXT_MIME_EXACT = new Set([
  "application/typescript",
  "application/xml",
  "image/svg+xml",
  "application/json",
  "application/javascript",
]);

interface AgentFileInfo {
  mimeType?: string;
  name: string;
  path: string;
  size?: number;
  type: string;
}

function normalizeDirPath(path: string): string {
  if (!path || path === "/") {
    return ROOT;
  }
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(TRAILING_SLASHES, "") || ROOT;
}

function isTextMime(mimeType: string): boolean {
  if (mimeType.startsWith("text/")) {
    return true;
  }
  return TEXT_MIME_EXACT.has(mimeType);
}

function isBinaryMime(mimeType: string): boolean {
  if (isTextMime(mimeType)) {
    return false;
  }
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/octet-stream" ||
    mimeType.includes("wasm")
  );
}

function guessMime(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return "text/plain";
  }
  const ext = path.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
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
  return map[ext] ?? "application/octet-stream";
}

function toEntry(info: AgentFileInfo): WorkspaceFileEntry | null {
  if (info.type === "directory") {
    return { name: info.name, path: info.path, type: "directory" };
  }
  if (info.type === "file" || info.type === "symlink") {
    return { name: info.name, path: info.path, type: "file" };
  }
  return null;
}

function filterRootEntries(
  entries: WorkspaceFileEntry[]
): WorkspaceFileEntry[] {
  return entries.filter((entry) => !HIDDEN_ROOT_NAMES.has(entry.name));
}

function sortEntries(entries: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

/**
 * Live AppAgent workspace (WIP). Mount only while the Code panel is open so
 * the WebSocket exists only then. Own socket (not chat attend) for correctness.
 */
export function useAppAgentWorkspace(appId: string): WorkspaceFilesSource {
  const [dirs, setDirs] = useState<Map<string, WorkspaceFileEntry[]>>(
    () => new Map()
  );
  const [files, setFiles] = useState<Map<string, WorkspaceFileContent | null>>(
    () => new Map()
  );
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(
    () => new Set()
  );
  const metaRef = useRef(new Map<string, { mimeType: string; size: number }>());
  const knownDirsRef = useRef(new Set<string>());
  const openFileRef = useRef<string | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);

  const agent = useAgent({
    agent: "AppAgent",
    name: appId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "workspace-change") {
          refreshRef.current();
        }
      } catch {
        // Non-JSON frame.
      }
    },
  });

  const callReadDir = useCallback(
    async (path: string) => {
      await agent.ready;
      const raw = (await agent.call("readDir", [path])) as
        | AgentFileInfo[]
        | null;
      const mapped = (raw ?? [])
        .map(toEntry)
        .filter((entry): entry is WorkspaceFileEntry => entry != null);
      for (const info of raw ?? []) {
        if (info.type === "file" || info.type === "symlink") {
          metaRef.current.set(info.path, {
            mimeType: info.mimeType || guessMime(info.path),
            size: typeof info.size === "number" ? info.size : 0,
          });
        }
      }
      return sortEntries(path === ROOT ? filterRootEntries(mapped) : mapped);
    },
    [agent]
  );

  const callReadFile = useCallback(
    async (path: string) => {
      await agent.ready;
      const meta = metaRef.current.get(path);
      const mimeType = meta?.mimeType ?? guessMime(path);
      const size = meta?.size ?? 0;
      if (size > MAX_PREVIEW_BYTES) {
        return {
          content: "",
          encoding: "too-large" as const,
          mimeType,
          size,
        };
      }
      if (isBinaryMime(mimeType)) {
        return {
          content: "",
          encoding: "binary" as const,
          mimeType,
          size,
        };
      }
      const content = (await agent.call("readFile", [path])) as string | null;
      if (content == null) {
        return null;
      }
      const bytes = new TextEncoder().encode(content).byteLength;
      if (bytes > MAX_PREVIEW_BYTES) {
        return {
          content: "",
          encoding: "too-large" as const,
          mimeType,
          size: bytes,
        };
      }
      return {
        content,
        encoding: "text" as const,
        mimeType,
        size: bytes,
      };
    },
    [agent]
  );

  const loadDir = useCallback(
    async (path: string) => {
      const dir = normalizeDirPath(path);
      knownDirsRef.current.add(dir);
      setLoadingDirs((prev) => new Set(prev).add(dir));
      try {
        const entries = await callReadDir(dir);
        setDirs((prev) => {
          const next = new Map(prev);
          next.set(dir, entries);
          return next;
        });
      } catch (error) {
        console.error("[preview] readDir failed", dir, error);
        setDirs((prev) => {
          const next = new Map(prev);
          next.set(dir, []);
          return next;
        });
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dir);
          return next;
        });
      }
    },
    [callReadDir]
  );

  const loadFile = useCallback(
    async (path: string) => {
      openFileRef.current = path;
      setLoadingFiles((prev) => new Set(prev).add(path));
      try {
        const content = await callReadFile(path);
        setFiles((prev) => {
          const next = new Map(prev);
          next.set(path, content);
          return next;
        });
      } catch (error) {
        console.error("[preview] readFile failed", path, error);
        setFiles((prev) => {
          const next = new Map(prev);
          next.set(path, null);
          return next;
        });
      } finally {
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [callReadFile]
  );

  useEffect(() => {
    refreshRef.current = () => {
      const dirsToReload = [...knownDirsRef.current];
      const openPath = openFileRef.current;
      metaRef.current.clear();
      fireAndForget(
        (async () => {
          await Promise.all(dirsToReload.map((dir) => loadDir(dir)));
          if (openPath) {
            await loadFile(openPath);
          }
        })()
      );
    };
  }, [loadDir, loadFile]);

  return useMemo<WorkspaceFilesSource>(
    () => ({
      getDir: (path) => dirs.get(normalizeDirPath(path)) ?? [],
      getFile: (path) => files.get(path) ?? null,
      ensureDir: (path) => {
        const dir = normalizeDirPath(path);
        if (dirs.has(dir) || loadingDirs.has(dir)) {
          return;
        }
        fireAndForget(loadDir(dir));
      },
      ensureFile: (path) => {
        if (files.has(path) || loadingFiles.has(path)) {
          return;
        }
        fireAndForget(loadFile(path));
      },
      isDirLoading: (path) => loadingDirs.has(normalizeDirPath(path)),
      isFileLoading: (path) => loadingFiles.has(path) && !files.has(path),
      isFileMissing: (path) => files.has(path) && files.get(path) === null,
    }),
    [dirs, files, loadDir, loadFile, loadingDirs, loadingFiles]
  );
}
