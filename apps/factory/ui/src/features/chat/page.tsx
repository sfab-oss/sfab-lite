import { ListTree, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createApp, getApp, listApps } from "@/api";
import {
  AppLayout,
  AppLayoutHeader,
  AppLayoutHeaderActions,
  AppLayoutPage,
} from "@/components/brand/app-layout";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRouter } from "@/router";
import {
  ResponsiveSidePanel,
  useSidePanelLayout,
} from "./components/responsive-side-panel";
import { SessionWorkspacePanel } from "./components/session-workspace-panel";
import { ThreadBindingBadge } from "./components/thread-binding-badge";
import { ThreadComposer } from "./components/thread-composer";
import { ThreadHeaderMenu } from "./components/thread-header-menu";
import { ThreadSummaryPanel } from "./components/thread-summary-panel";
import { ThreadTranscript } from "./components/thread-transcript";
import { SessionThreadsSidebar } from "./components/threads-sidebar";
import {
  AppAgentRegistryProvider,
  createServerThread,
  useAppAgentRegistry,
} from "./data/app-agent-bridge";
import { ChatDataProvider, useChatData } from "./data/chat-data-context";
import {
  createRealChatData,
  type RealChatData,
} from "./data/create-real-chat-data";
import { useWorkspaceTabsStore } from "./lib/workspace-tabs-store";
import type { Thread } from "./model/types";

const TITLE_FIRST_LINE = /\n/;
const APP_READY_POLL_MS = 800;
const APP_READY_TIMEOUT_MS = 120_000;

function titleFromText(text: string): string {
  const first = text.trim().split(TITLE_FIRST_LINE)[0] ?? "New thread";
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
}

async function waitForAppReady(appId: string): Promise<void> {
  const deadline = Date.now() + APP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const app = await getApp(appId);
    if (app.status === "ready") {
      return;
    }
    if (app.status === "failed") {
      throw new Error("app creation failed");
    }
    await new Promise((resolve) => setTimeout(resolve, APP_READY_POLL_MS));
  }
  throw new Error("app creation timed out");
}

export function ChatScreen() {
  const [chatData] = useState<RealChatData>(() => createRealChatData());
  return (
    <ChatDataProvider value={chatData}>
      <AppAgentRegistryProvider>
        <ChatScreenInner />
      </AppAgentRegistryProvider>
    </ChatDataProvider>
  );
}

function routeAttention(route: ReturnType<typeof useRouter>["route"]): {
  appId: string | null;
  threadId: string | null;
} {
  if (route.name === "thread" || route.name === "dev-chat") {
    return {
      appId: route.appId ?? null,
      threadId: route.threadId ?? null,
    };
  }
  return { appId: null, threadId: null };
}

function resolveActiveThread(
  activeThreadId: string | null,
  threads: Thread[],
  routeAppId: string | null,
  scopeAppName: string | null
): Thread | null {
  if (!activeThreadId) {
    return null;
  }
  const found = threads.find((thread) => thread.id === activeThreadId);
  if (found) {
    return found;
  }
  if (!routeAppId) {
    return null;
  }
  return {
    id: activeThreadId,
    appId: routeAppId,
    appName: scopeAppName,
    readOnly: false,
    status: "idle",
    title: "Loading…",
    createdAt: 0,
    updatedAt: 0,
  };
}

function ChatScreenInner() {
  const chatData = useChatData();
  const { attend, clearAttention, waitForHandle } = useAppAgentRegistry();
  const threads = chatData.listThreads();
  const isMobile = useIsMobile();
  const { route, navigate } = useRouter();
  const [search, setSearch] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [seedByThread, setSeedByThread] = useState<Record<string, string>>({});
  const [scopeAppId, setScopeAppId] = useState<string | null>(null);
  const [scopeAppName, setScopeAppName] = useState<string | null>(null);
  const [readyApps, setReadyApps] = useState<
    Array<{ appId: string; appName: string }>
  >([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const workspaceOpen = useWorkspaceTabsStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useWorkspaceTabsStore((s) => s.setWorkspaceOpen);
  const { canDock, setContainerNode } = useSidePanelLayout();

  useEffect(() => {
    let cancelled = false;
    listApps()
      .then(({ apps }) => {
        if (cancelled) {
          return;
        }
        setReadyApps(
          apps
            .filter((app) => app.status === "ready")
            .map((app) => ({ appId: app.id, appName: app.name }))
        );
      })
      .catch((error: unknown) => {
        console.error("[chat] listApps failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { appId: routeAppId, threadId: routeThreadId } = routeAttention(route);

  useEffect(() => {
    if (route.name === "thread" || (route.name === "dev-chat" && route.appId)) {
      setActiveThreadId(routeThreadId);
      if (routeAppId) {
        setScopeAppId(routeAppId);
        const known = readyApps.find((app) => app.appId === routeAppId);
        setScopeAppName(known?.appName ?? null);
        attend(routeAppId, known?.appName ?? null);
      }
      return;
    }
    if (route.name === "chat" || route.name === "dev-chat") {
      setActiveThreadId(null);
    }
  }, [attend, readyApps, route, routeAppId, routeThreadId]);

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && route.name === "dev-chat") {
      navigate({ name: "dev-chat" });
      return;
    }
    navigate({ name: "chat" });
  }, [navigate, route.name]);

  const goThread = useCallback(
    (appId: string, threadId: string) => {
      if (import.meta.env.DEV && route.name === "dev-chat") {
        navigate({ name: "dev-chat", appId, threadId });
        return;
      }
      navigate({ name: "thread", appId, threadId });
    },
    [navigate, route.name]
  );

  const activeThread = useMemo(
    () =>
      resolveActiveThread(activeThreadId, threads, routeAppId, scopeAppName),
    [activeThreadId, routeAppId, scopeAppName, threads]
  );

  const attendedAppId = activeThread?.appId ?? scopeAppId;

  useEffect(() => {
    chatData.refreshApp(attendedAppId).catch((error: unknown) => {
      console.error("[chat] refreshApp failed", error);
    });
  }, [attendedAppId, chatData]);

  // resolveActiveThread synthesises a placeholder so a cold URL can attend its
  // app before the thread arrives. Once the registry has answered for that app,
  // a still-missing thread is gone, not late — drop to the app's composer
  // rather than leaving the placeholder loading forever.
  useEffect(() => {
    if (!(activeThreadId && routeAppId)) {
      return;
    }
    if (!chatData.hasSyncedApp(routeAppId)) {
      return;
    }
    if (threads.some((thread) => thread.id === activeThreadId)) {
      return;
    }
    setActiveThreadId(null);
    goChatHome();
    setCreateError("That conversation no longer exists.");
  }, [activeThreadId, chatData, goChatHome, routeAppId, threads]);

  const scopedApp = useMemo(() => {
    if (activeThread?.appId) {
      return {
        appId: activeThread.appId,
        appName: activeThread.appName,
      };
    }
    if (!scopeAppId) {
      return null;
    }
    const known = readyApps.find((app) => app.appId === scopeAppId);
    const sample = threads.find((thread) => thread.appId === scopeAppId);
    return {
      appId: scopeAppId,
      appName: known?.appName ?? sample?.appName ?? scopeAppName,
    };
  }, [activeThread, readyApps, scopeAppId, scopeAppName, threads]);

  const selectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((entry) => entry.id === threadId);
      if (!thread?.appId) {
        return;
      }
      setScopeAppId(thread.appId);
      setScopeAppName(thread.appName);
      attend(thread.appId, thread.appName);
      setActiveThreadId(threadId);
      setSummaryOpen(false);
      goThread(thread.appId, threadId);
    },
    [attend, goThread, threads]
  );

  const attendApp = useCallback(
    (appId: string, appName: string) => {
      setScopeAppId(appId);
      setScopeAppName(appName);
      attend(appId, appName);
      setActiveThreadId(null);
      setSummaryOpen(false);
      setWorkspaceOpen(false);
      setCreateError(null);
      goChatHome();
    },
    [attend, goChatHome, setWorkspaceOpen]
  );

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setScopeAppId(null);
    setScopeAppName(null);
    clearAttention();
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    setCreateError(null);
    goChatHome();
  }, [clearAttention, goChatHome, setWorkspaceOpen]);

  const newThread = useCallback(() => {
    if (activeThread?.appId) {
      setScopeAppId(activeThread.appId);
      setScopeAppName(activeThread.appName);
      attend(activeThread.appId, activeThread.appName);
    }
    setActiveThreadId(null);
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    setCreateError(null);
    goChatHome();
  }, [activeThread, attend, goChatHome, setWorkspaceOpen]);

  const createThreadFromBlank = useCallback(
    async (text: string) => {
      if (creating) {
        return;
      }
      setCreating(true);
      setCreateError(null);
      try {
        let appId = scopedApp?.appId ?? null;
        let appName: string | null = scopedApp?.appName ?? null;
        if (!appId) {
          appName = titleFromText(text);
          const created = await createApp(appName);
          appId = created.appId;
          await waitForAppReady(appId);
          setReadyApps((current) => {
            if (current.some((app) => app.appId === appId)) {
              return current;
            }
            return [
              ...current,
              { appId: appId as string, appName: appName as string },
            ];
          });
        }
        setScopeAppId(appId);
        setScopeAppName(appName);
        attend(appId, appName);
        const handle = await waitForHandle(appId);
        const summary = await createServerThread(handle, {
          title: titleFromText(text),
        });
        const thread: Thread = {
          id: summary.id,
          appId,
          appName,
          readOnly: false,
          status: "idle",
          title: summary.title,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        };
        chatData.upsertThread(thread);
        setSeedByThread((current) => ({ ...current, [summary.id]: text }));
        setActiveThreadId(summary.id);
        goThread(appId, summary.id);
      } catch (error: unknown) {
        setCreateError(error instanceof Error ? error.message : String(error));
      } finally {
        setCreating(false);
      }
    },
    [attend, chatData, creating, goThread, scopedApp, waitForHandle]
  );

  const consumeSeed = useCallback((threadId: string) => {
    setSeedByThread((current) => {
      if (!(threadId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }, []);

  const onSetWorkspaceOpen = (
    value: boolean | ((open: boolean) => boolean)
  ) => {
    setWorkspaceOpen(
      typeof value === "function" ? value(workspaceOpen) : value
    );
  };

  const onSignOut = () => {
    navigate({ name: "sign-in" }, true);
  };

  const displayThread =
    activeThread && activeThread.title === "Loading…"
      ? (threads.find((thread) => thread.id === activeThread.id) ??
        activeThread)
      : activeThread;

  return (
    <TooltipProvider>
      <AppLayout
        sidebar={
          <SessionThreadsSidebar
            activeThreadId={activeThreadId}
            homeActive={
              activeThreadId === null &&
              (route.name === "chat" ||
                (route.name === "dev-chat" && !route.threadId))
            }
            knownApps={readyApps}
            onAttendApp={attendApp}
            onGoHome={goHome}
            onNewThread={newThread}
            onSearchChange={setSearch}
            onSelectThread={selectThread}
            onSignOut={onSignOut}
            search={search}
            threads={threads}
          />
        }
      >
        <AppLayoutPage>
          {isMobile ? (
            <MobileLayout
              activeThread={displayThread}
              canDock={canDock}
              createError={createError}
              creating={creating}
              onBlankSubmit={createThreadFromBlank}
              onCloseRail={() => setSummaryOpen(false)}
              onSeedConsumed={consumeSeed}
              onSetContainerNode={setContainerNode}
              onSetSummaryOpen={setSummaryOpen}
              onSetWorkspaceOpen={onSetWorkspaceOpen}
              seedMessage={
                activeThreadId ? (seedByThread[activeThreadId] ?? null) : null
              }
              summaryOpen={summaryOpen}
              workspaceOpen={workspaceOpen}
            />
          ) : (
            <DesktopLayout
              activeThread={displayThread}
              canDock={canDock}
              createError={createError}
              creating={creating}
              onBlankSubmit={createThreadFromBlank}
              onCloseRail={() => setSummaryOpen(false)}
              onSeedConsumed={consumeSeed}
              onSetContainerNode={setContainerNode}
              onSetSummaryOpen={setSummaryOpen}
              onSetWorkspaceOpen={onSetWorkspaceOpen}
              seedMessage={
                activeThreadId ? (seedByThread[activeThreadId] ?? null) : null
              }
              summaryOpen={summaryOpen}
              workspaceOpen={workspaceOpen}
            />
          )}
        </AppLayoutPage>
      </AppLayout>
    </TooltipProvider>
  );
}

interface ChatChromeProps {
  activeThread: Thread | null;
  canDock: boolean;
  createError: string | null;
  creating: boolean;
  onBlankSubmit: (text: string) => void;
  onCloseRail: () => void;
  onSeedConsumed: (threadId: string) => void;
  onSetContainerNode: (node: HTMLElement | null) => void;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  seedMessage: string | null;
  summaryOpen: boolean;
  workspaceOpen: boolean;
}

function MobileLayout(props: ChatChromeProps) {
  const { activeThread, workspaceOpen } = props;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatColumn {...props} />
      </div>
      <Sheet onOpenChange={props.onSetWorkspaceOpen} open={workspaceOpen}>
        <SheetContent
          className="flex h-svh flex-col gap-0 overflow-hidden p-0 data-[side=right]:w-[calc(100%-2.5rem)] data-[side=right]:max-w-none data-[side=right]:sm:max-w-none [&>button]:hidden"
          side="right"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace</SheetTitle>
          </SheetHeader>
          {workspaceOpen && activeThread ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-accent/5">
              <SessionWorkspacePanel
                onDismiss={() => props.onSetWorkspaceOpen(false)}
                threadId={activeThread.id}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DesktopLayout(props: ChatChromeProps) {
  const { activeThread, workspaceOpen } = props;
  return (
    <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
      <ResizablePanel
        className="flex min-h-0 flex-col"
        defaultSize={workspaceOpen ? 65 : 100}
        minSize={workspaceOpen ? 28 : 40}
      >
        <ChatColumn {...props} />
      </ResizablePanel>
      {workspaceOpen && activeThread ? (
        <>
          <ResizableHandle className="bg-transparent" />
          <ResizablePanel
            className="ml-px flex min-h-0 flex-col overflow-hidden rounded-l-xl border-border border-l bg-accent/5 shadow"
            defaultSize={35}
            maxSize={60}
            minSize={22}
          >
            <SessionWorkspacePanel threadId={activeThread.id} />
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}

function ChatColumn({
  activeThread,
  canDock,
  createError,
  creating,
  onBlankSubmit,
  onCloseRail,
  onSeedConsumed,
  onSetContainerNode,
  onSetSummaryOpen,
  onSetWorkspaceOpen,
  seedMessage,
  summaryOpen,
  workspaceOpen,
}: ChatChromeProps) {
  return (
    <>
      <ThreadHeader
        activeThread={activeThread}
        onSetSummaryOpen={onSetSummaryOpen}
        onSetWorkspaceOpen={onSetWorkspaceOpen}
        summaryOpen={summaryOpen}
        workspaceOpen={workspaceOpen}
      />
      <div
        className="flex min-h-0 flex-1 flex-col transition-[justify-content] duration-300 ease-out"
        ref={onSetContainerNode}
      >
        {activeThread ? (
          <ResponsiveSidePanel
            canDock={canDock}
            onClose={onCloseRail}
            open={summaryOpen}
            panel={<ThreadSummaryPanel thread={activeThread} />}
          >
            <ThreadTranscript
              initialMessage={seedMessage ?? undefined}
              key={activeThread.id}
              onInitialConsumed={() => onSeedConsumed(activeThread.id)}
              thread={activeThread}
            />
          </ResponsiveSidePanel>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 transition-all duration-300 ease-out">
            <div className="mb-6 max-w-md text-center">
              <p className="font-medium text-lg">What should we build?</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Describe an app or pick up a thread from the sidebar.
              </p>
            </div>
            <div className="w-full max-w-3xl">
              <ThreadComposer
                onStop={() => undefined}
                onSubmit={onBlankSubmit}
                placeholder={
                  creating
                    ? "Creating app…"
                    : "Describe the app you want to build…"
                }
                running={creating}
              />
              {createError ? (
                <p className="mt-2 text-center text-destructive text-sm">
                  {createError}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ThreadHeader({
  activeThread,
  onSetSummaryOpen,
  onSetWorkspaceOpen,
  summaryOpen,
  workspaceOpen,
}: {
  activeThread: Thread | null;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  summaryOpen: boolean;
  workspaceOpen: boolean;
}) {
  return (
    <AppLayoutHeader className="px-3">
      {activeThread ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate font-medium text-sm">
              {activeThread.title}
            </span>
            <ThreadBindingBadge thread={activeThread} />
            <ThreadHeaderMenu />
          </div>
          <AppLayoutHeaderActions>
            <Button
              aria-label={
                summaryOpen ? "Hide summary panel" : "Show summary panel"
              }
              aria-pressed={summaryOpen}
              onClick={() => onSetSummaryOpen((open) => !open)}
              size="icon-sm"
              type="button"
              variant={summaryOpen ? "secondary" : "ghost"}
            >
              <ListTree className="size-4" />
            </Button>
            <Button
              aria-label={
                workspaceOpen ? "Hide workspace panel" : "Show workspace panel"
              }
              aria-pressed={workspaceOpen}
              onClick={() => onSetWorkspaceOpen((open) => !open)}
              size="icon-sm"
              type="button"
              variant={workspaceOpen ? "secondary" : "ghost"}
            >
              <PanelRight className="size-4" />
            </Button>
          </AppLayoutHeaderActions>
        </>
      ) : null}
    </AppLayoutHeader>
  );
}
