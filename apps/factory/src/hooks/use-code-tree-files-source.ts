import { useCallback, useMemo, useRef, useState } from "react";
import { fetchTreeFileAtRef } from "@/lib/api/code-tree";
import { dirEntries, fileContent } from "@/lib/chat/source-files";
import type {
  WorkspaceFileContent,
  WorkspaceFilesSource,
} from "@/lib/workspace-files/types";

/**
 * Code-tab source: dirs from path index (sync); file bodies via ensureFile.
 * Remount (key=sha) when the tip changes so file cache resets.
 */
export function useCodeTreeFilesSource(
  appId: string,
  ref: string,
  paths: string[],
  sha: string
): WorkspaceFilesSource {
  const [files, setFiles] = useState<
    Record<string, WorkspaceFileContent | null>
  >({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, true>>({});
  const filesRef = useRef(files);
  filesRef.current = files;
  const loadingFilesRef = useRef(loadingFiles);
  loadingFilesRef.current = loadingFiles;
  const generationRef = useRef(0);

  const pathIndex = useMemo(
    () => Object.fromEntries(paths.map((p) => [p, ""])),
    [paths]
  );

  const loadFile = useCallback(
    (uiPath: string) => {
      if (!(sha && ref)) {
        return;
      }
      if (uiPath in filesRef.current || uiPath in loadingFilesRef.current) {
        return;
      }
      const generation = generationRef.current;
      setLoadingFiles((prev) => ({ ...prev, [uiPath]: true }));
      fetchTreeFileAtRef(appId, ref, uiPath)
        .then((body) => {
          if (generation !== generationRef.current) {
            return;
          }
          setFiles((prev) => ({
            ...prev,
            [uiPath]: fileContent({ [uiPath]: body.content }, uiPath),
          }));
        })
        .catch(() => {
          if (generation !== generationRef.current) {
            return;
          }
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
    [appId, ref, sha]
  );

  return useMemo(
    () => ({
      getDir: (path) => dirEntries(pathIndex, path).entries,
      getFile: (path) => (path in files ? (files[path] ?? null) : null),
      ensureFile: (path) => {
        loadFile(path);
      },
      isFileLoading: (path) => Boolean(loadingFiles[path]),
      isFileMissing: (path) => path in files && files[path] === null,
    }),
    [pathIndex, files, loadingFiles, loadFile]
  );
}
