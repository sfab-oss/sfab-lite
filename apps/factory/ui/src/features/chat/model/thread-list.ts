import type { Thread, ThreadStatus } from "./types";

const STATUS_RANK: Record<ThreadStatus, number> = {
  done: 3,
  idle: 2,
  "needs-you": 1,
  running: 0,
};

export function isActiveThread(thread: Thread): boolean {
  return thread.status === "running" || thread.status === "needs-you";
}

function sortByUpdated(threads: Thread[]): Thread[] {
  return [...threads].sort(
    (left, right) => left.updatedMinutesAgo - right.updatedMinutesAgo
  );
}

export function groupInactiveByApp(threads: Thread[]): {
  appId: string;
  appName: string;
  threads: Thread[];
}[] {
  const inactive = threads.filter((thread) => !isActiveThread(thread));
  const byApp = new Map<
    string,
    { appId: string; appName: string; threads: Thread[] }
  >();

  for (const thread of sortByUpdated(inactive)) {
    if (!(thread.appId && thread.appName)) {
      continue;
    }
    const existing = byApp.get(thread.appId);
    if (existing) {
      existing.threads.push(thread);
      continue;
    }
    byApp.set(thread.appId, {
      appId: thread.appId,
      appName: thread.appName,
      threads: [thread],
    });
  }

  return [...byApp.values()].sort((left, right) =>
    left.appName.localeCompare(right.appName)
  );
}

export function searchThreads(threads: Thread[], search: string): Thread[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return threads;
  }
  return threads.filter(
    (thread) =>
      thread.title.toLowerCase().includes(query) ||
      thread.headline?.toLowerCase().includes(query) ||
      thread.appName?.toLowerCase().includes(query)
  );
}

export function sortByLiveness(threads: Thread[]): Thread[] {
  return [...threads].sort(
    (left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status]
  );
}
