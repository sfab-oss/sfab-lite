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

export interface WorkspaceFilesSource {
  getDir: (path: string) => WorkspaceFileEntry[];
  getFile: (path: string) => WorkspaceFileContent | null;
  isDirLoading?: (path: string) => boolean;
  isFileLoading?: (path: string) => boolean;
  isFileMissing?: (path: string) => boolean;
}
