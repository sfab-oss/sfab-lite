import { create } from "zustand";
import { persist } from "zustand/middleware";

export const VIEW_KINDS = ["chat", "files", "browser", "versions"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];
export type PanelId = "primary" | "secondary";

const KNOWN_KINDS: ReadonlySet<string> = new Set(VIEW_KINDS);

export interface OpenTab {
  id: string;
  kind: ViewKind;
}

export interface PanelState {
  activeId: string | null;
  tabs: OpenTab[];
}

export interface AppLayoutState {
  focusedPanel: PanelId;
  primary: PanelState;
  secondary: PanelState | null;
}

interface WorkspaceTabsState {
  byApp: Record<string, AppLayoutState>;
  closePanel: (appId: string, panel: PanelId) => void;
  closeTab: (appId: string, panel: PanelId, id: string) => void;
  ensureApp: (appId: string) => void;
  focusPanel: (appId: string, panel: PanelId) => void;
  focusTab: (appId: string, panel: PanelId, id: string) => void;
  moveTab: (
    appId: string,
    from: PanelId,
    tabId: string,
    to: PanelId,
    toIndex?: number
  ) => void;
  openTab: (appId: string, kind: ViewKind, target?: PanelId | "side") => void;
  reorderTab: (
    appId: string,
    panel: PanelId,
    tabId: string,
    toIndex: number
  ) => void;
  resetLocalState: () => void;
}

const LAB_WORKSPACE_STORAGE_KEY = "sfab.lab.devSessionTabs.v3";

function emptyPanel(): PanelState {
  return { tabs: [], activeId: null };
}

function defaultAppLayout(): AppLayoutState {
  const chat = makeTab("chat");
  const browser = makeTab("browser");
  return {
    focusedPanel: "primary",
    primary: { tabs: [chat], activeId: chat.id },
    secondary: { tabs: [browser], activeId: browser.id },
  };
}

function panelHasKind(panel: PanelState | null, kind: ViewKind): boolean {
  return panel?.tabs.some((tab) => tab.kind === kind) ?? false;
}

export function findTabPanel(
  layout: AppLayoutState,
  kind: ViewKind
): PanelId | null {
  if (panelHasKind(layout.primary, kind)) {
    return "primary";
  }
  if (panelHasKind(layout.secondary, kind)) {
    return "secondary";
  }
  return null;
}

export function findPanelForTabId(
  layout: AppLayoutState,
  tabId: string
): PanelId | null {
  if (layout.primary.tabs.some((tab) => tab.id === tabId)) {
    return "primary";
  }
  if (layout.secondary?.tabs.some((tab) => tab.id === tabId)) {
    return "secondary";
  }
  return null;
}

export function panelDroppableId(panel: PanelId): string {
  return `panel:${panel}`;
}

export function parsePanelDroppableId(id: string): PanelId | null {
  if (id === "panel:primary") {
    return "primary";
  }
  if (id === "panel:secondary") {
    return "secondary";
  }
  return null;
}

function makeTab(kind: ViewKind): OpenTab {
  return { id: crypto.randomUUID(), kind };
}

function getPanel(layout: AppLayoutState, panel: PanelId): PanelState | null {
  return panel === "primary" ? layout.primary : layout.secondary;
}

function withActiveAfterClose(panel: PanelState, closedId: string): PanelState {
  const tabs = panel.tabs.filter((tab) => tab.id !== closedId);
  const activeId =
    panel.activeId === closedId ? (tabs.at(-1)?.id ?? null) : panel.activeId;
  return { tabs, activeId };
}

function addTabToPanel(
  panel: PanelState,
  tab: OpenTab,
  toIndex?: number
): PanelState {
  const tabs = [...panel.tabs];
  const index =
    toIndex == null ? tabs.length : Math.max(0, Math.min(toIndex, tabs.length));
  tabs.splice(index, 0, tab);
  return { tabs, activeId: tab.id };
}

function reorderTabsInPanel(
  panel: PanelState,
  tabId: string,
  toIndex: number
): PanelState | null {
  const fromIndex = panel.tabs.findIndex((tab) => tab.id === tabId);
  if (fromIndex < 0) {
    return null;
  }
  const clamped = Math.max(0, Math.min(toIndex, panel.tabs.length - 1));
  if (fromIndex === clamped) {
    return null;
  }
  const tabs = [...panel.tabs];
  const [tab] = tabs.splice(fromIndex, 1);
  if (!tab) {
    return null;
  }
  tabs.splice(clamped, 0, tab);
  return { ...panel, tabs };
}

function resolveEmptyPanels(
  primary: PanelState,
  secondary: PanelState | null,
  focusedPanel: PanelId
): AppLayoutState {
  let nextSecondary = secondary;
  let nextFocused = focusedPanel;

  if (nextSecondary && nextSecondary.tabs.length === 0) {
    nextSecondary = null;
    nextFocused = "primary";
  }

  if (primary.tabs.length === 0 && nextSecondary) {
    return {
      focusedPanel: "primary",
      primary: nextSecondary,
      secondary: null,
    };
  }

  if (primary.tabs.length === 0 && !nextSecondary) {
    return {
      focusedPanel: "primary",
      primary: emptyPanel(),
      secondary: null,
    };
  }

  if (!nextSecondary && nextFocused === "secondary") {
    nextFocused = "primary";
  }

  return {
    focusedPanel: nextFocused,
    primary,
    secondary: nextSecondary,
  };
}

function setApp(
  state: WorkspaceTabsState,
  appId: string,
  next: AppLayoutState
): Partial<WorkspaceTabsState> {
  return { byApp: { ...state.byApp, [appId]: next } };
}

function ensureLayout(
  state: WorkspaceTabsState,
  appId: string
): AppLayoutState {
  return state.byApp[appId] ?? defaultAppLayout();
}

function revivePanel(value: unknown): PanelState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const stored = value as Partial<PanelState>;
  const tabs = (Array.isArray(stored.tabs) ? stored.tabs : []).filter(
    (tab): tab is OpenTab =>
      typeof tab?.id === "string" && KNOWN_KINDS.has(tab?.kind)
  );
  if (tabs.length === 0) {
    return emptyPanel();
  }
  const active = tabs.find((tab) => tab.id === stored.activeId);
  return { tabs, activeId: active?.id ?? tabs[0]?.id ?? null };
}

function reviveLayout(value: unknown): AppLayoutState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const stored = value as Partial<AppLayoutState>;
  const primary = revivePanel(stored.primary) ?? emptyPanel();
  let secondary = revivePanel(stored.secondary);
  if (secondary && secondary.tabs.length === 0) {
    secondary = null;
  }

  const hasChat =
    panelHasKind(primary, "chat") || panelHasKind(secondary, "chat");
  const hasAnyTabs =
    primary.tabs.length > 0 ||
    (secondary !== null && secondary.tabs.length > 0);
  if (!(hasChat || hasAnyTabs)) {
    return null;
  }

  const focusedPanel: PanelId =
    stored.focusedPanel === "secondary" && secondary ? "secondary" : "primary";

  return { focusedPanel, primary, secondary };
}

function reviveByApp(value: unknown): Record<string, AppLayoutState> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const revived: Record<string, AppLayoutState> = {};
  for (const [appId, raw] of Object.entries(value)) {
    const layout = reviveLayout(raw);
    if (layout) {
      revived[appId] = layout;
    }
  }
  return revived;
}

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set) => ({
      byApp: {},

      ensureApp: (appId) =>
        set((state) => {
          if (state.byApp[appId]) {
            return {};
          }
          return setApp(state, appId, defaultAppLayout());
        }),

      openTab: (appId, kind, target) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          const existingPanel = findTabPanel(layout, kind);
          if (existingPanel) {
            const panel = getPanel(layout, existingPanel);
            const existing = panel?.tabs.find((tab) => tab.kind === kind);
            if (!(panel && existing)) {
              return {};
            }
            return setApp(state, appId, {
              ...layout,
              focusedPanel: existingPanel,
              [existingPanel]: { ...panel, activeId: existing.id },
            });
          }

          const tab = makeTab(kind);
          const dest: PanelId =
            target === "side" ? "secondary" : (target ?? layout.focusedPanel);

          if (dest === "secondary") {
            const secondary =
              layout.secondary === null
                ? { tabs: [tab], activeId: tab.id }
                : addTabToPanel(layout.secondary, tab);
            return setApp(state, appId, {
              ...layout,
              focusedPanel: "secondary",
              secondary,
            });
          }

          return setApp(state, appId, {
            ...layout,
            focusedPanel: "primary",
            primary: addTabToPanel(layout.primary, tab),
          });
        }),

      closeTab: (appId, panel, id) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          const current = getPanel(layout, panel);
          if (!current?.tabs.some((tab) => tab.id === id)) {
            return {};
          }

          const updated = withActiveAfterClose(current, id);
          return setApp(
            state,
            appId,
            resolveEmptyPanels(
              panel === "primary" ? updated : layout.primary,
              panel === "secondary" ? updated : layout.secondary,
              layout.focusedPanel
            )
          );
        }),

      focusTab: (appId, panel, id) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          const current = getPanel(layout, panel);
          if (!current?.tabs.some((tab) => tab.id === id)) {
            return {};
          }
          if (layout.focusedPanel === panel && current.activeId === id) {
            return {};
          }
          return setApp(state, appId, {
            ...layout,
            focusedPanel: panel,
            [panel]: { ...current, activeId: id },
          });
        }),

      focusPanel: (appId, panel) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          if (panel === "secondary" && layout.secondary === null) {
            return {};
          }
          if (layout.focusedPanel === panel) {
            return {};
          }
          return setApp(state, appId, { ...layout, focusedPanel: panel });
        }),

      closePanel: (appId, panel) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          if (panel === "secondary") {
            if (layout.secondary === null) {
              return {};
            }
            return setApp(state, appId, {
              focusedPanel: "primary",
              primary: layout.primary,
              secondary: null,
            });
          }

          if (layout.secondary) {
            return setApp(state, appId, {
              focusedPanel: "primary",
              primary: layout.secondary,
              secondary: null,
            });
          }

          return setApp(state, appId, {
            focusedPanel: "primary",
            primary: emptyPanel(),
            secondary: null,
          });
        }),

      moveTab: (appId, from, tabId, to, toIndex) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          if (from === to) {
            return {};
          }
          const source = getPanel(layout, from);
          const tab = source?.tabs.find((t) => t.id === tabId);
          if (!(tab && source)) {
            return {};
          }

          const cleanedSource = withActiveAfterClose(source, tabId);
          let primary = from === "primary" ? cleanedSource : layout.primary;
          let secondary =
            from === "secondary" ? cleanedSource : layout.secondary;

          if (to === "primary") {
            primary = addTabToPanel(primary, tab, toIndex);
          } else if (secondary === null) {
            secondary = { tabs: [tab], activeId: tab.id };
          } else {
            secondary = addTabToPanel(secondary, tab, toIndex);
          }

          return setApp(
            state,
            appId,
            resolveEmptyPanels(primary, secondary, to)
          );
        }),

      reorderTab: (appId, panel, tabId, toIndex) =>
        set((state) => {
          const layout = ensureLayout(state, appId);
          const current = getPanel(layout, panel);
          if (!current) {
            return {};
          }
          const next = reorderTabsInPanel(current, tabId, toIndex);
          if (!next) {
            return {};
          }
          return setApp(state, appId, {
            ...layout,
            focusedPanel: panel,
            [panel]: next,
          });
        }),

      resetLocalState: () => set({ byApp: {} }),
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
      }),
    }
  )
);

export function useAppLayout(appId: string): AppLayoutState {
  return useWorkspaceTabsStore((s) => s.byApp[appId] ?? defaultAppLayout());
}
