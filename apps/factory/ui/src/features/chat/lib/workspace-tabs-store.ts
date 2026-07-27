import { create } from "zustand";
import { persist } from "zustand/middleware";

export const WORKSPACE_KINDS = ["files", "browser", "versions"] as const;

export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

const KNOWN_KINDS: ReadonlySet<string> = new Set(WORKSPACE_KINDS);

const SINGLETON_KINDS: ReadonlySet<WorkspaceKind> = new Set([
  "files",
  "browser",
  "versions",
]);

export interface OpenTab {
  id: string;
  kind: WorkspaceKind;
}

interface ThreadTabs {
  activeId: string | null;
  tabs: OpenTab[];
}

interface WorkspaceTabsState {
  byThread: Record<string, ThreadTabs>;
  closeTab: (threadId: string, id: string) => void;
  focusTab: (threadId: string, id: string) => void;
  openTab: (threadId: string, kind: WorkspaceKind) => void;
  resetLocalState: () => void;
  setWorkspaceOpen: (open: boolean) => void;
  workspaceOpen: boolean;
}

const EMPTY: ThreadTabs = { tabs: [], activeId: null };

const LAB_WORKSPACE_STORAGE_KEY = "sfab.lab.devSessionTabs.v1";

function makeTab(kind: WorkspaceKind): OpenTab {
  return { id: crypto.randomUUID(), kind };
}

function setThread(
  state: WorkspaceTabsState,
  threadId: string,
  next: ThreadTabs
): Partial<WorkspaceTabsState> {
  return { byThread: { ...state.byThread, [threadId]: next } };
}

// Persisted state outlives the code that wrote it: a kind that is renamed or
// retired stays in localStorage and would otherwise reach a lookup keyed on
// the current union.
function reviveByThread(value: unknown): Record<string, ThreadTabs> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const revived: Record<string, ThreadTabs> = {};
  for (const [threadId, raw] of Object.entries(value)) {
    const stored = raw as Partial<ThreadTabs> | null;
    const tabs = (Array.isArray(stored?.tabs) ? stored.tabs : []).filter(
      (tab): tab is OpenTab =>
        typeof tab?.id === "string" && KNOWN_KINDS.has(tab?.kind)
    );
    if (tabs.length === 0) {
      continue;
    }
    const active = tabs.find((tab) => tab.id === stored?.activeId);
    revived[threadId] = { tabs, activeId: active?.id ?? tabs[0]?.id ?? null };
  }
  return revived;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set) => ({
      byThread: {},
      workspaceOpen: false,

      setWorkspaceOpen: (open) => set({ workspaceOpen: open }),

      openTab: (threadId, kind) =>
        set((state) => {
          const thread = state.byThread[threadId] ?? EMPTY;
          if (SINGLETON_KINDS.has(kind)) {
            const existing = thread.tabs.find((tab) => tab.kind === kind);
            if (existing) {
              return setThread(state, threadId, {
                ...thread,
                activeId: existing.id,
              });
            }
          }
          const tab = makeTab(kind);
          return {
            ...setThread(state, threadId, {
              tabs: [...thread.tabs, tab],
              activeId: tab.id,
            }),
            workspaceOpen: true,
          };
        }),

      closeTab: (threadId, id) =>
        set((state) => {
          const thread = state.byThread[threadId] ?? EMPTY;
          if (!thread.tabs.some((tab) => tab.id === id)) {
            return {};
          }
          const tabs = thread.tabs.filter((tab) => tab.id !== id);
          const activeId =
            thread.activeId === id
              ? (tabs.at(-1)?.id ?? null)
              : thread.activeId;
          return setThread(state, threadId, { tabs, activeId });
        }),

      focusTab: (threadId, id) =>
        set((state) => {
          const thread = state.byThread[threadId] ?? EMPTY;
          if (thread.activeId === id) {
            return {};
          }
          return setThread(state, threadId, { ...thread, activeId: id });
        }),

      resetLocalState: () => set({ byThread: {}, workspaceOpen: false }),
    }),
    {
      name: LAB_WORKSPACE_STORAGE_KEY,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WorkspaceTabsState>),
        byThread: reviveByThread(
          (persisted as { byThread?: unknown } | null)?.byThread
        ),
      }),
    }
  )
);

export const useThreadTabs = (threadId: string): ThreadTabs =>
  useWorkspaceTabsStore((s) => s.byThread[threadId] ?? EMPTY);
