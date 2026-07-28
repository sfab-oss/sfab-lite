import type { Thread, ThreadStatus } from "./types";

const STATUS_RANK: Record<ThreadStatus, number> = {
  done: 3,
  idle: 2,
  "needs-you": 1,
  running: 0,
};

export function groupThreadsByApp(
  threads: Thread[],
  knownApps: Array<{ appId: string; appName: string }> = []
): {
  appId: string;
  appName: string;
  threads: Thread[];
}[] {
  const byApp = new Map<
    string,
    { appId: string; appName: string; threads: Thread[] }
  >();

  for (const app of knownApps) {
    byApp.set(app.appId, {
      appId: app.appId,
      appName: app.appName,
      threads: [],
    });
  }

  for (const thread of sortByLiveness(threads)) {
    if (!thread.appId) {
      continue;
    }
    const existing = byApp.get(thread.appId);
    if (existing) {
      existing.threads.push(thread);
      if (thread.appName) {
        existing.appName = thread.appName;
      }
      continue;
    }
    if (!thread.appName) {
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
      thread.appName?.toLowerCase().includes(query)
  );
}

function sortByLiveness(threads: Thread[]): Thread[] {
  return [...threads].sort((left, right) => {
    const byStatus = STATUS_RANK[left.status] - STATUS_RANK[right.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    return right.updatedAt - left.updatedAt;
  });
}

export function formatRelativeTime(at: number, now = Date.now()): string {
  const deltaMs = Math.max(0, now - at);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 14) {
    return `${days}d`;
  }
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}
