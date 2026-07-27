import type { UIMessage } from "ai";
import type {
  AppVersion,
  AttachedFile,
  SlashCommand,
  Subagent,
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
  listAttachedFiles: (threadId: string) => AttachedFile[];
  listCommands: () => SlashCommand[];
  listSubagents: (threadId: string) => Subagent[];
  listTerminalLines: () => string[];
  listThreads: () => Thread[];
  listVersions: () => AppVersion[];
  lookupSubagent: (threadId: string, runId: string) => Subagent | undefined;
  nestedRunToMessages: (run: Subagent) => UIMessage[];
  saveThreads: (threads: Thread[]) => void;
}
