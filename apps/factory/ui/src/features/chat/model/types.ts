export type ThreadStatus = "done" | "idle" | "needs-you" | "running";

export interface Thread {
  appId: string | null;
  appName: string | null;
  createdAt: number;
  id: string;
  readOnly: boolean;
  status: ThreadStatus;
  title: string;
  updatedAt: number;
}

export interface AppVersion {
  createdAt: string;
  id: string;
  label: string;
  live: boolean;
}

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
