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

export type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "@/features/workspace-files/types";
