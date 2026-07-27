import type { Thread } from "../model/types";

const STORAGE_KEY = "sfab-lite:chat-threads:v1";

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
    return parsed.filter(isThread);
  } catch {
    return [];
  }
}

export function saveThreads(threads: Thread[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function isThread(value: unknown): value is Thread {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string";
}
