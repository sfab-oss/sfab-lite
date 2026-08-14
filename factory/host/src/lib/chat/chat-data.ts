import type { Thread } from "@/lib/chat/types";

/**
 * Data seam for the chat console. Transport is not here: ThreadTranscript
 * connects with useAgent({ agent: "AppAgent", name, sub: [...] }) + useAgentChat.
 * Thread existence comes from AppAgent.listThreads / createThread.
 * Workspace working-tree files are loaded by Files/Git tabs via AppAgent RPCs.
 */
export interface ChatData {
  getAppId: () => string | null;
  /** Whether AppAgent.listThreads has answered for this workspace yet. */
  hasSyncedWorkspace: (workspaceId: string) => boolean;
  listThreads: () => Thread[];
  patchThread: (threadId: string, patch: Partial<Thread>) => void;
  refreshApp: (appId: string | null) => Promise<void>;
  /** Drop a thread from local state (e.g. right after a successful delete). */
  removeThread: (threadId: string) => void;
  /**
   * Replace this workspace's threads with AppAgent's snapshot. The facet registry is
   * authoritative, so a thread it no longer lists is gone — merging alone would
   * keep deleted threads in the sidebar until remount.
   */
  syncWorkspaceThreads: (workspaceId: string, threads: Thread[]) => void;
  upsertThread: (thread: Thread) => void;
}
