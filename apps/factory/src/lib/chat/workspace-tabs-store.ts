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

interface AppTabs {
  activeId: string | null;
  tabs: OpenTab[];
}

interface WorkspaceTabsState {
  byApp: Record<string, AppTabs>;
  chatHidden: boolean;
  closeTab: (appId: string, id: string) => void;
  focusTab: (appId: string, id: string) => void;
  openTab: (appId: string, kind: WorkspaceKind) => void;
  resetLocalState: () => void;
  setChatHidden: (hidden: boolean) => void;
  setWorkspaceOpen: (open: boolean) => void;
  workspaceOpen: boolean;
}

const EMPTY: AppTabs = { tabs: [], activeId: null };

const LAB_WORKSPACE_STORAGE_KEY = "sfab.lab.devSessionTabs.v2";

function makeTab(kind: WorkspaceKind): OpenTab {
  return { id: crypto.randomUUID(), kind };
}

function setApp(
  state: WorkspaceTabsState,
  appId: string,
  next: AppTabs
): Partial<WorkspaceTabsState> {
  return { byApp: { ...state.byApp, [appId]: next } };
}

function reviveByApp(value: unknown): Record<string, AppTabs> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const revived: Record<string, AppTabs> = {};
  for (const [appId, raw] of Object.entries(value)) {
    const stored = raw as Partial<AppTabs> | null;
    const tabs = (Array.isArray(stored?.tabs) ? stored.tabs : []).filter(
      (tab): tab is OpenTab =>
        typeof tab?.id === "string" && KNOWN_KINDS.has(tab?.kind)
    );
    if (tabs.length === 0) {
      continue;
    }
    const active = tabs.find((tab) => tab.id === stored?.activeId);
    revived[appId] = { tabs, activeId: active?.id ?? tabs[0]?.id ?? null };
  }
  return revived;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set) => ({
      byApp: {},
      workspaceOpen: true,
      chatHidden: false,

      setWorkspaceOpen: (open) => set({ workspaceOpen: open }),

      setChatHidden: (hidden) =>
        set({
          chatHidden: hidden,
          ...(hidden ? { workspaceOpen: true } : {}),
        }),

      openTab: (appId, kind) =>
        set((state) => {
          const app = state.byApp[appId] ?? EMPTY;
          if (SINGLETON_KINDS.has(kind)) {
            const existing = app.tabs.find((tab) => tab.kind === kind);
            if (existing) {
              return {
                ...setApp(state, appId, {
                  ...app,
                  activeId: existing.id,
                }),
                workspaceOpen: true,
              };
            }
          }
          const tab = makeTab(kind);
          return {
            ...setApp(state, appId, {
              tabs: [...app.tabs, tab],
              activeId: tab.id,
            }),
            workspaceOpen: true,
          };
        }),

      closeTab: (appId, id) =>
        set((state) => {
          const app = state.byApp[appId] ?? EMPTY;
          if (!app.tabs.some((tab) => tab.id === id)) {
            return {};
          }
          const tabs = app.tabs.filter((tab) => tab.id !== id);
          const activeId =
            app.activeId === id ? (tabs.at(-1)?.id ?? null) : app.activeId;
          return setApp(state, appId, { tabs, activeId });
        }),

      focusTab: (appId, id) =>
        set((state) => {
          const app = state.byApp[appId] ?? EMPTY;
          if (app.activeId === id) {
            return {};
          }
          return setApp(state, appId, { ...app, activeId: id });
        }),

      resetLocalState: () =>
        set({ byApp: {}, workspaceOpen: true, chatHidden: false }),
    }),
    {
      name: LAB_WORKSPACE_STORAGE_KEY,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<WorkspaceTabsState>),
        byApp: reviveByApp((persisted as { byApp?: unknown } | null)?.byApp),
      }),
      partialize: (state) => ({
        byApp: state.byApp,
        workspaceOpen: state.workspaceOpen,
        chatHidden: state.chatHidden,
      }),
    }
  )
);

export const useAppWorkspaceTabs = (appId: string): AppTabs =>
  useWorkspaceTabsStore((s) => s.byApp[appId] ?? EMPTY);
