import { getLiveSources, listVersions } from "@/api";
import type { AppVersion, Thread } from "../model/types";
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

  const writeThreads = (next: Thread[]) => {
    threads = next;
    persistThreads(next);
    notify();
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
    upsertThread: (thread) => {
      const without = threads.filter((entry) => entry.id !== thread.id);
      writeThreads([thread, ...without]);
    },
    patchThread: (threadId, patch) => {
      const index = threads.findIndex((thread) => thread.id === threadId);
      if (index < 0) {
        return;
      }
      const current = threads[index] as Thread;
      const merged: Thread = { ...current, ...patch };
      if (
        merged.status === current.status &&
        merged.updatedAt === current.updatedAt &&
        merged.title === current.title &&
        merged.readOnly === current.readOnly &&
        merged.appId === current.appId &&
        merged.appName === current.appName
      ) {
        return;
      }
      const next = threads.slice();
      next[index] = merged;
      writeThreads(next);
    },
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
