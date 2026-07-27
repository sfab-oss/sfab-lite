import type {
  AppVersion,
  Thread,
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "../model/types";

/**
 * Data seam for the chat console. Transport is not here: ThreadTranscript
 * connects with `useAgent({ agent: "AppThread", name })` + `useAgentChat`
 * (same wiring as the deleted `/dev/agent` harness).
 */
export interface ChatData {
  getWorkspaceDir: (path: string) => {
    entries: WorkspaceFileEntry[];
    path: string;
  };
  getWorkspaceFile: (path: string) => WorkspaceFileContent | null;
  listThreads: () => Thread[];
  listVersions: () => AppVersion[];
  patchThread: (threadId: string, patch: Partial<Thread>) => void;
  refreshApp: (appId: string | null) => Promise<void>;
  upsertThread: (thread: Thread) => void;
}
