export interface WorkspaceFileEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

export interface WorkspaceFileContent {
  content: string;
  encoding: "binary" | "text" | "too-large";
  mimeType: string;
  size: number;
}

/**
 * File tree/viewer data. Getters are pure cache reads (safe during render).
 * Async sources implement `ensureDir` / `ensureFile` for effect-driven loads;
 * sync adapters (published chat sources) omit them.
 */
export interface WorkspaceFilesSource {
  getDir: (path: string) => WorkspaceFileEntry[];
  getFile: (path: string) => WorkspaceFileContent | null;
  ensureDir?: (path: string) => void;
  ensureFile?: (path: string) => void;
  isDirLoading?: (path: string) => boolean;
  isFileLoading?: (path: string) => boolean;
  isFileMissing?: (path: string) => boolean;
}
