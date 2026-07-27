import { getLiveSources, listVersions } from "@/api";
import type { AppVersion, Thread } from "../model/types";
import type { ChatData } from "./chat-data";
import { dirEntries, fileContent } from "./source-files";

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
  let appId: string | null = null;
  let sourceFiles: Record<string, string> = {};
  let versions: AppVersion[] = [];
  let threads: Thread[] = [];
  let revision = 0;
  const syncedApps = new Set<string>();
  const listeners = new Set<() => void>();

  const notify = () => {
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  };

  const writeThreads = (next: Thread[]) => {
    threads = next;
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
    hasSyncedApp: (id) => syncedApps.has(id),
    syncAppThreads: (ownerAppId, incoming) => {
      syncedApps.add(ownerAppId);
      const byId = new Map(threads.map((thread) => [thread.id, thread]));
      const owned = incoming.map((thread) => {
        const existing = byId.get(thread.id);
        return existing
          ? {
              ...thread,
              status: existing.status,
              readOnly: existing.readOnly,
              appName: thread.appName ?? existing.appName,
            }
          : thread;
      });
      const others = threads.filter((thread) => thread.appId !== ownerAppId);
      writeThreads(
        [...others, ...owned].sort((a, b) => b.updatedAt - a.updatedAt)
      );
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
    getAppId: () => appId,
    listVersions: () => versions,
    getWorkspaceDir: (path) => dirEntries(sourceFiles, path),
    getWorkspaceFile: (path) => fileContent(sourceFiles, path),
    async refreshApp(nextAppId) {
      if (!nextAppId) {
        appId = null;
        sourceFiles = {};
        versions = [];
        notify();
        return;
      }
      const [listed, live] = await Promise.all([
        listVersions(nextAppId),
        getLiveSources(nextAppId).catch(() => null),
      ]);
      appId = nextAppId;
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
