import type {
  Thread,
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from "@/lib/chat/types";

/**
 * Data seam for the chat console. Transport is not here: ThreadTranscript
 * connects with useAgent({ agent: "AppAgent", name, sub: [...] }) + useAgentChat.
 * Thread existence comes from AppAgent.listThreads / createThread.
 */
export interface ChatData {
  getAppId: () => string | null;
  getLiveSha: () => string | null;
  getWorkspaceDir: (path: string) => {
    entries: WorkspaceFileEntry[];
    path: string;
  };
  getWorkspaceFile: (path: string) => WorkspaceFileContent | null;
  /** Whether AppAgent.listThreads has answered for this app yet. */
  hasSyncedApp: (appId: string) => boolean;
  listThreads: () => Thread[];
  patchThread: (threadId: string, patch: Partial<Thread>) => void;
  refreshApp: (appId: string | null) => Promise<void>;
  /** Drop a thread from local state (e.g. right after a successful delete). */
  removeThread: (threadId: string) => void;
  /**
   * Replace this app's threads with AppAgent's snapshot. The facet registry is
   * authoritative, so a thread it no longer lists is gone — merging alone would
   * keep deleted threads in the sidebar until remount.
   */
  syncAppThreads: (appId: string, threads: Thread[]) => void;
  upsertThread: (thread: Thread) => void;
}
