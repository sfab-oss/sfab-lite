import { fetchLiveSources } from "@/lib/api/apps";
import type { Thread } from "@/lib/chat/types";
import type { ChatData } from "./chat-data";
import { dirEntries, fileContent } from "./source-files";

export interface RealChatData extends ChatData {
  getRevision: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createRealChatData(): RealChatData {
  let appId: string | null = null;
  let liveSha: string | null = null;
  let sourceFiles: Record<string, string> = {};
  let threads: Thread[] = [];
  let revision = 0;
  const syncedWorkspaces = new Set<string>();
  // A listThreads snapshot in flight when a thread is created predates it, so
  // pruning against that snapshot would delete the thread the user is entering.
  // Locally created threads survive until a snapshot actually reports them.
  const unconfirmed = new Set<string>();
  // Symmetrically: a snapshot in flight when a thread is deleted can still list
  // it. Suppress re-adding until that workspace's later snapshot omits the id.
  // Keyed by thread id → owning workspaceId so a sync for another workspace
  // cannot clear the suppression early.
  const recentlyDeleted = new Map<string, string>();
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
      recentlyDeleted.delete(thread.id);
      unconfirmed.add(thread.id);
      const without = threads.filter((entry) => entry.id !== thread.id);
      writeThreads([thread, ...without]);
    },
    hasSyncedWorkspace: (id) => syncedWorkspaces.has(id),
    syncWorkspaceThreads: (ownerWorkspaceId, incoming) => {
      syncedWorkspaces.add(ownerWorkspaceId);
      for (const [id, deletedWorkspaceId] of [...recentlyDeleted]) {
        if (
          deletedWorkspaceId === ownerWorkspaceId &&
          !incoming.some((thread) => thread.id === id)
        ) {
          recentlyDeleted.delete(id);
        }
      }
      const byId = new Map(threads.map((thread) => [thread.id, thread]));
      const owned = incoming
        .filter((thread) => !recentlyDeleted.has(thread.id))
        .map((thread) => {
          unconfirmed.delete(thread.id);
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
      const incomingIds = new Set(owned.map((thread) => thread.id));
      const kept = threads.filter(
        (thread) =>
          thread.workspaceId !== ownerWorkspaceId ||
          (unconfirmed.has(thread.id) && !incomingIds.has(thread.id))
      );
      writeThreads(
        [...kept, ...owned].sort((a, b) => b.updatedAt - a.updatedAt)
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
        merged.workspaceId === current.workspaceId &&
        merged.appName === current.appName
      ) {
        return;
      }
      const next = threads.slice();
      next[index] = merged;
      writeThreads(next);
    },
    removeThread: (threadId) => {
      unconfirmed.delete(threadId);
      const existing = threads.find((thread) => thread.id === threadId);
      if (existing?.workspaceId) {
        recentlyDeleted.set(threadId, existing.workspaceId);
      }
      if (!existing) {
        return;
      }
      writeThreads(threads.filter((thread) => thread.id !== threadId));
    },
    getAppId: () => appId,
    getLiveSha: () => liveSha,
    getWorkspaceDir: (path) => dirEntries(sourceFiles, path),
    getWorkspaceFile: (path) => fileContent(sourceFiles, path),
    async refreshApp(nextAppId) {
      if (!nextAppId) {
        appId = null;
        liveSha = null;
        sourceFiles = {};
        notify();
        return;
      }
      const live = await fetchLiveSources(nextAppId).catch(() => null);
      appId = nextAppId;
      liveSha = live?.liveSha ?? null;
      sourceFiles = live?.sourceFiles ?? {};
      notify();
    },
  };
}
