import type {
  AppVersion,
  Thread,
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "../model/types";

/**
 * Data seam for the chat console. Transport is not here: ThreadTranscript
 * connects with useAgent({ agent: "AppAgent", name, sub: [...] }) + useAgentChat.
 * Thread existence comes from AppAgent.listThreads / createThread.
 */
export interface ChatData {
  getAppId: () => string | null;
  getWorkspaceDir: (path: string) => {
    entries: WorkspaceFileEntry[];
    path: string;
  };
  getWorkspaceFile: (path: string) => WorkspaceFileContent | null;
  listThreads: () => Thread[];
  listVersions: () => AppVersion[];
  mergeThreads: (threads: Thread[]) => void;
  patchThread: (threadId: string, patch: Partial<Thread>) => void;
  refreshApp: (appId: string | null) => Promise<void>;
  upsertThread: (thread: Thread) => void;
}
