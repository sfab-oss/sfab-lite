import type { ChatData } from "../chat-data";
import {
  createThreadChat,
  createThreadTransport,
  listThreadAttachedFiles,
} from "./mock-chat";
import {
  listThreadSubagents,
  lookupSubagent,
  nestedRunToMessages,
} from "./mock-subagents";
import { MOCK_COMMANDS, MOCK_THREADS } from "./mock-threads";
import { MOCK_VERSIONS } from "./mock-versions";
import { getMockDir, getMockFile } from "./mock-workspace-files";

const MOCK_TERMINAL_LINES = [
  "pnpm test invoices",
  "",
  " ✓ src/features/invoices/__tests__/export.test.ts (7)",
  " ✓ src/features/invoices/__tests__/filters.test.ts (5)",
  "",
  " Test Files  2 passed (2)",
  "      Tests  12 passed (12)",
];

export function createMockChatData(): ChatData {
  return {
    listThreads: () => MOCK_THREADS,
    listCommands: () => MOCK_COMMANDS,
    listVersions: () => MOCK_VERSIONS,
    listTerminalLines: () => MOCK_TERMINAL_LINES,
    listAttachedFiles: listThreadAttachedFiles,
    listSubagents: listThreadSubagents,
    lookupSubagent,
    nestedRunToMessages,
    createThreadChat,
    createThreadTransport,
    getWorkspaceDir: getMockDir,
    getWorkspaceFile: getMockFile,
  };
}
