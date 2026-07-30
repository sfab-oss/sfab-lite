type ThreadStatus = "done" | "idle" | "needs-you" | "running";

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

export type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "@/lib/workspace-files/types";
