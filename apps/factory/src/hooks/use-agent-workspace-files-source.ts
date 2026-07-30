import { useAgent } from "agents/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { mimeFor } from "@/lib/workspace-files/mime";
import type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceFilesSource,
} from "@/lib/workspace-files/types";

const HIDDEN_ROOT_NAMES = new Set(["bin", "usr", "dev", "proc", "sys", "tmp"]);

const TRIM_SLASHES = /^\/+|\/+$/g;
const LEADING_SLASHES = /^\/+/;

interface AgentDirEntry {
  name: string;
  path: string;
  type: string;
  mimeType?: string;
  size?: number;
}

function toAgentPath(uiPath: string): string {
  const trimmed = uiPath.replace(TRIM_SLASHES, "");
  return trimmed ? `/${trimmed}` : "/";
}

function toUiPath(agentPath: string): string {
  return agentPath.replace(LEADING_SLASHES, "");
}

function mapDirEntries(
  entries: AgentDirEntry[],
  parentUiPath: string
): WorkspaceFileEntry[] {
  const mapped: WorkspaceFileEntry[] = [];
  for (const entry of entries) {
    if (entry.type !== "file" && entry.type !== "directory") {
      continue;
    }
    if (!parentUiPath && HIDDEN_ROOT_NAMES.has(entry.name)) {
      continue;
    }
    mapped.push({
      name: entry.name,
      path: toUiPath(entry.path),
      type: entry.type === "directory" ? "directory" : "file",
    });
  }
  return mapped.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function toFileContent(
  path: string,
  content: string | null
): WorkspaceFileContent | null {
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

export function useAgentWorkspaceFilesSource(workspaceId: string): {
  revision: string;
  source: WorkspaceFilesSource;
} {
  const [dirs, setDirs] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [files, setFiles] = useState<
    Record<string, WorkspaceFileContent | null>
  >({});
  const [loadingDirs, setLoadingDirs] = useState<Record<string, true>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, true>>({});
  const [revision, setRevision] = useState(0);

  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const filesRef = useRef(files);
  filesRef.current = files;
  const loadingDirsRef = useRef(loadingDirs);
  loadingDirsRef.current = loadingDirs;
  const loadingFilesRef = useRef(loadingFiles);
  loadingFilesRef.current = loadingFiles;
  const generationRef = useRef(0);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    setDirs({});
    setFiles({});
    setLoadingDirs({});
    setLoadingFiles({});
    setRevision((n) => n + 1);
  }, []);

  const agent = useAgent({
    agent: "AppAgent",
    name: workspaceId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "workspace-change") {
          invalidate();
        }
      } catch {
        // Non-JSON frame.
      }
    },
  });

  const loadDir = useCallback(
    (uiPath: string) => {
      if (uiPath in dirsRef.current || uiPath in loadingDirsRef.current) {
        return;
      }
      const generation = generationRef.current;
      setLoadingDirs((prev) => ({ ...prev, [uiPath]: true }));
      agent.ready
        .then(
          () =>
            agent.call("readDir", [toAgentPath(uiPath)]) as Promise<
              AgentDirEntry[]
            >
        )
        .then((entries) => {
          if (generation !== generationRef.current) {
            return;
          }
          const list = Array.isArray(entries)
            ? mapDirEntries(entries, uiPath)
            : [];
          setDirs((prev) => ({ ...prev, [uiPath]: list }));
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) {
            return;
          }
          console.error("[files] readDir failed", uiPath, error);
          setDirs((prev) => ({ ...prev, [uiPath]: [] }));
        })
        .finally(() => {
          if (generation !== generationRef.current) {
            return;
          }
          setLoadingDirs((prev) => {
            const next = { ...prev };
            delete next[uiPath];
            return next;
          });
        });
    },
    [agent]
  );

  const loadFile = useCallback(
    (uiPath: string) => {
      if (uiPath in filesRef.current || uiPath in loadingFilesRef.current) {
        return;
      }
      const generation = generationRef.current;
      setLoadingFiles((prev) => ({ ...prev, [uiPath]: true }));
      agent.ready
        .then(
          () =>
            agent.call("readFile", [toAgentPath(uiPath)]) as Promise<
              string | null
            >
        )
        .then((content) => {
          if (generation !== generationRef.current) {
            return;
          }
          setFiles((prev) => ({
            ...prev,
            [uiPath]: toFileContent(uiPath, content),
          }));
        })
        .catch((error: unknown) => {
          if (generation !== generationRef.current) {
            return;
          }
          console.error("[files] readFile failed", uiPath, error);
          setFiles((prev) => ({ ...prev, [uiPath]: null }));
        })
        .finally(() => {
          if (generation !== generationRef.current) {
            return;
          }
          setLoadingFiles((prev) => {
            const next = { ...prev };
            delete next[uiPath];
            return next;
          });
        });
    },
    [agent]
  );

  const source = useMemo<WorkspaceFilesSource>(
    () => ({
      getDir: (path) => dirs[path] ?? [],
      getFile: (path) => (path in files ? (files[path] ?? null) : null),
      ensureDir: (path) => {
        loadDir(path);
      },
      ensureFile: (path) => {
        loadFile(path);
      },
      isDirLoading: (path) => Boolean(loadingDirs[path]),
      isFileLoading: (path) => Boolean(loadingFiles[path]),
      isFileMissing: (path) => path in files && files[path] === null,
    }),
    [dirs, files, loadDir, loadFile, loadingDirs, loadingFiles]
  );

  return { source, revision: String(revision) };
}
