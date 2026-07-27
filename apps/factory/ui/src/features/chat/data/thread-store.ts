import type { Thread } from "../model/types";

const STORAGE_KEY = "sfab-lite:chat-threads:v2";

export function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((value) => {
      const thread = normalizeThread(value);
      return thread ? [thread] : [];
    });
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function normalizeThread(value: unknown): Thread | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return null;
  }
  const now = Date.now();
  const createdAt =
    typeof row.createdAt === "number" && Number.isFinite(row.createdAt)
      ? row.createdAt
      : now;
  const updatedAt =
    typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt)
      ? row.updatedAt
      : createdAt;
  const status =
    row.status === "running" ||
    row.status === "needs-you" ||
    row.status === "done" ||
    row.status === "idle"
      ? row.status
      : "idle";
  return {
    id: row.id,
    title: row.title,
    appId: typeof row.appId === "string" ? row.appId : null,
    appName: typeof row.appName === "string" ? row.appName : null,
    readOnly: row.readOnly === true,
    status,
    createdAt,
    updatedAt,
  };
}
