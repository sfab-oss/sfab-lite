import type { UIMessage } from "ai";
import { getLiveSources, listVersions } from "@/api";
import type { AppVersion } from "../model/types";
import type { ChatData } from "./chat-data";
import { dirEntries, fileContent } from "./source-files";
import { loadThreads, saveThreads as persistThreads } from "./thread-store";

function formatCreatedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export interface RealChatData extends ChatData {
  getRevision: () => number;
  refreshApp: (appId: string | null) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
}

export function createRealChatData(): RealChatData {
  let sourceFiles: Record<string, string> = {};
  let versions: AppVersion[] = [];
  let threads = loadThreads();
  let revision = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getRevision: () => revision,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listThreads: () => threads,
    saveThreads: (next) => {
      threads = next;
      persistThreads(next);
      // Callers often persist inside a React setState updater; notifying
      // synchronously would re-enter useSyncExternalStore mid-render.
      queueMicrotask(notify);
    },
    listCommands: () => [],
    listAttachedFiles: () => [],
    listSubagents: () => [],
    lookupSubagent: () => undefined,
    nestedRunToMessages: (_run): UIMessage[] => [],
    listTerminalLines: () => [],
    listVersions: () => versions,
    getWorkspaceDir: (path) => dirEntries(sourceFiles, path),
    getWorkspaceFile: (path) => fileContent(sourceFiles, path),
    async refreshApp(appId) {
      if (!appId) {
        sourceFiles = {};
        versions = [];
        notify();
        return;
      }
      const [listed, live] = await Promise.all([
        listVersions(appId),
        getLiveSources(appId).catch(() => null),
      ]);
      sourceFiles = live?.sourceFiles ?? {};
      versions = listed.versions.map((version, index) => ({
        id: version.id,
        label: `v${listed.versions.length - index}`,
        createdAt: formatCreatedAt(version.createdAt),
        live: version.id === listed.liveVersionId,
      }));
      notify();
    },
  };
}
