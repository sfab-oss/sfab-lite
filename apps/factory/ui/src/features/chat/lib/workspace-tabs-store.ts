import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceKind = "files" | "terminal" | "browser" | "versions";
type TabKind = WorkspaceKind | "agent-run";

const SINGLETON_KINDS: ReadonlySet<WorkspaceKind> = new Set([
  "files",
  "browser",
  "versions",
]);

export interface OpenTab {
  agentRunId?: string;
  id: string;
  kind: TabKind;
}

interface ThreadTabs {
  activeId: string | null;
  tabs: OpenTab[];
}

interface WorkspaceTabsState {
  byThread: Record<string, ThreadTabs>;
  closeTab: (threadId: string, id: string) => void;
  focusTab: (threadId: string, id: string) => void;
  openAgentRunTab: (threadId: string, agentRunId: string) => void;
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

      openAgentRunTab: (threadId, agentRunId) =>
        set((state) => {
          const thread = state.byThread[threadId] ?? EMPTY;
          const existing = thread.tabs.find(
            (tab) => tab.kind === "agent-run" && tab.agentRunId === agentRunId
          );
          if (existing) {
            return {
              ...setThread(state, threadId, {
                ...thread,
                activeId: existing.id,
              }),
              workspaceOpen: true,
            };
          }
          const tab: OpenTab = {
            id: crypto.randomUUID(),
            kind: "agent-run",
            agentRunId,
          };
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
    { name: LAB_WORKSPACE_STORAGE_KEY }
  )
);

export const useThreadTabs = (threadId: string): ThreadTabs =>
  useWorkspaceTabsStore((s) => s.byThread[threadId] ?? EMPTY);
