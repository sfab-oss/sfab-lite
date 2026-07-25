import type { AiSdkChat } from "@shadcn/helpers/ai-sdk";
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

export interface ChatData {
  createThreadChat: (threadId: string) => AiSdkChat;
  createThreadTransport: (
    chat: AiSdkChat,
    timing?: { delayMs?: number; firstTokenMs?: number; toolRunMs?: number }
  ) => ReturnType<AiSdkChat["transport"]>;
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
}
