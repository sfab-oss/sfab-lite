import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@sfab-lite/ui/components/shadcn/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@sfab-lite/ui/components/shadcn/sheet";
import { TooltipProvider } from "@sfab-lite/ui/components/shadcn/tooltip";
import { useIsMobile } from "@sfab-lite/ui/hooks/use-mobile";
import { useMatch, useMatchRoute, useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { ListTree, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppLayout,
  AppLayoutHeader,
  AppLayoutHeaderActions,
  AppLayoutPage,
} from "@/components/brand/app-layout";
import { readyAppsFromList, useApps, useCreateApp } from "@/hooks/use-apps";
import { AppDetailScreen } from "@/screens/app-detail";
import { AppsListScreen } from "@/screens/apps-list";
import type { ComposerScope } from "./components/composer-scope-chip";
import {
  ResponsiveSidePanel,
  useSidePanelLayout,
} from "./components/responsive-side-panel";
import { SessionWorkspacePanel } from "./components/session-workspace-panel";
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

type ConsolePanel =
  | { panel: "apps" }
  | { panel: "app"; appId: string }
  | { panel: "thread"; appId: string; threadId: string }
  | { panel: "chat" }
  | { panel: "dev-chat"; appId?: string; threadId?: string };

function useConsolePanel(): ConsolePanel {
  const matchRoute = useMatchRoute();
  const threadMatch = useMatch({
    from: "/_protected/apps/$appId/t/$threadId",
    shouldThrow: false,
  });
  const devThreadMatch = useMatch({
    from: "/dev/chat/apps/$appId/t/$threadId",
    shouldThrow: false,
  });
  const devChatMatch = useMatch({
    from: "/dev/chat",
    shouldThrow: false,
  });

  if (devThreadMatch) {
    return {
      panel: "dev-chat",
      appId: devThreadMatch.params.appId,
      threadId: devThreadMatch.params.threadId,
    };
  }
  if (devChatMatch) {
    return { panel: "dev-chat" };
  }
  if (threadMatch) {
    return {
      panel: "thread",
      appId: threadMatch.params.appId,
      threadId: threadMatch.params.threadId,
    };
  }
  const appParams = matchRoute({ to: "/apps/$appId", fuzzy: false });
  if (appParams) {
    return { panel: "app", appId: appParams.appId };
  }
  if (matchRoute({ to: "/apps", fuzzy: false })) {
    return { panel: "apps" };
  }
  return { panel: "chat" };
}

function titleFromText(text: string): string {
  const first = text.trim().split(TITLE_FIRST_LINE)[0] ?? "New thread";
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
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

function panelAttention(panel: ConsolePanel): {
  appId: string | null;
  threadId: string | null;
} {
  if (panel.panel === "thread" || panel.panel === "dev-chat") {
    return {
      appId: panel.appId ?? null,
      threadId: panel.threadId ?? null,
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
  const navigate = useNavigate();
  const panel = useConsolePanel();
  const isDevChat = panel.panel === "dev-chat";
  const appsQuery = useApps();
  const createApp = useCreateApp();
  const [search, setSearch] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [seedByThread, setSeedByThread] = useState<Record<string, string>>({});
  const [scopeAppId, setScopeAppId] = useState<string | null>(null);
  const [scopeAppName, setScopeAppName] = useState<string | null>(null);
  const readyApps = useMemo(
    () => readyAppsFromList(appsQuery.data?.apps),
    [appsQuery.data?.apps]
  );
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const workspaceOpen = useWorkspaceTabsStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useWorkspaceTabsStore((s) => s.setWorkspaceOpen);
  const { canDock, setContainerNode } = useSidePanelLayout();

  const creating = createApp.isPending;
  const createError =
    shellError ??
    (createApp.error instanceof Error ? createApp.error.message : null);

  const { appId: routeAppId, threadId: routeThreadId } = panelAttention(panel);

  useEffect(() => {
    if (panel.panel === "apps" || panel.panel === "app") {
      setActiveThreadId(null);
      return;
    }
    if (
      panel.panel === "thread" ||
      (panel.panel === "dev-chat" && panel.appId)
    ) {
      setActiveThreadId(routeThreadId);
      if (routeAppId) {
        setScopeAppId(routeAppId);
        const known = readyApps.find((app) => app.appId === routeAppId);
        setScopeAppName(known?.appName ?? null);
        attend(routeAppId, known?.appName ?? null);
      }
      return;
    }
    if (panel.panel === "chat" || panel.panel === "dev-chat") {
      setActiveThreadId(null);
    }
  }, [attend, panel, readyApps, routeAppId, routeThreadId]);

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && isDevChat) {
      navigate({ to: "/dev/chat" });
      return;
    }
    navigate({ to: "/" });
  }, [isDevChat, navigate]);

  const goThread = useCallback(
    (appId: string, threadId: string) => {
      if (import.meta.env.DEV && isDevChat) {
        navigate({
          to: "/dev/chat/apps/$appId/t/$threadId",
          params: { appId, threadId },
        });
        return;
      }
      navigate({
        to: "/apps/$appId/t/$threadId",
        params: { appId, threadId },
      });
    },
    [isDevChat, navigate]
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
    setShellError("That conversation no longer exists.");
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
      setShellError(null);
      createApp.reset();
      goChatHome();
    },
    [attend, createApp, goChatHome, setWorkspaceOpen]
  );

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setScopeAppId(null);
    setScopeAppName(null);
    clearAttention();
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    setShellError(null);
    createApp.reset();
    goChatHome();
  }, [clearAttention, createApp, goChatHome, setWorkspaceOpen]);

  const newThread = useCallback(() => {
    if (activeThread?.appId) {
      setScopeAppId(activeThread.appId);
      setScopeAppName(activeThread.appName);
      attend(activeThread.appId, activeThread.appName);
    }
    setActiveThreadId(null);
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    setShellError(null);
    createApp.reset();
    goChatHome();
  }, [activeThread, attend, createApp, goChatHome, setWorkspaceOpen]);

  const handleThreadDeleted = useCallback(
    (thread: Thread) => {
      setSeedByThread((current) => {
        if (!(thread.id in current)) {
          return current;
        }
        const next = { ...current };
        delete next[thread.id];
        return next;
      });
      const appName =
        thread.appName ??
        readyApps.find((app) => app.appId === thread.appId)?.appName ??
        null;
      if (activeThreadId === thread.id || !activeThreadId) {
        if (thread.appId) {
          attendApp(thread.appId, appName ?? "App");
        } else {
          goHome();
        }
      }
    },
    [activeThreadId, attendApp, goHome, readyApps]
  );

  const createThreadFromBlank = useCallback(
    async (text: string) => {
      if (createApp.isPending) {
        return;
      }
      setShellError(null);
      createApp.reset();
      try {
        let appId = scopedApp?.appId ?? null;
        let appName: string | null = scopedApp?.appName ?? null;
        if (!appId) {
          const created = await createApp.mutateAsync(undefined);
          appId = created.appId;
          appName = created.name;
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
        setShellError(error instanceof Error ? error.message : String(error));
      }
    },
    [attend, chatData, createApp, goThread, scopedApp, waitForHandle]
  );

  const createEmptyApp = useCallback(async () => {
    if (createApp.isPending) {
      return;
    }
    setShellError(null);
    try {
      const created = await createApp.mutateAsync(undefined);
      navigate({
        to: "/apps/$appId",
        params: { appId: created.appId },
      });
    } catch {
      // Error on createApp.error
    }
  }, [createApp, navigate]);

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

  const composerScope = useMemo<ComposerScope>(
    () => ({
      appId: scopeAppId,
      appName: scopedApp?.appName ?? scopeAppName,
      apps: readyApps,
      onAttendApp: attendApp,
      onClearScope: goHome,
    }),
    [attendApp, goHome, readyApps, scopeAppId, scopeAppName, scopedApp]
  );

  const onSetWorkspaceOpen = (
    value: boolean | ((open: boolean) => boolean)
  ) => {
    setWorkspaceOpen(
      typeof value === "function" ? value(workspaceOpen) : value
    );
  };

  const onSignOut = () => {
    navigate({ to: "/signin", replace: true });
  };

  const displayThread =
    activeThread && activeThread.title === "Loading…"
      ? (threads.find((thread) => thread.id === activeThread.id) ??
        activeThread)
      : activeThread;

  const appsRoute = panel.panel === "apps" || panel.panel === "app";
  const homeActive =
    !appsRoute &&
    activeThreadId === null &&
    (panel.panel === "chat" || (panel.panel === "dev-chat" && !panel.threadId));

  return (
    <TooltipProvider>
      <AppLayout
        sidebar={
          <SessionThreadsSidebar
            activeAppId={panel.panel === "app" ? panel.appId : null}
            activeThreadId={appsRoute ? null : activeThreadId}
            appsActive={appsRoute}
            homeActive={homeActive}
            knownApps={readyApps}
            onGoHome={goHome}
            onNewThread={newThread}
            onSearchChange={setSearch}
            onSelectThread={selectThread}
            onSignOut={onSignOut}
            onThreadDeleted={handleThreadDeleted}
            search={search}
            threads={threads}
          />
        }
      >
        <AppLayoutPage>
          <ChatMainPane
            chatProps={{
              activeThread: displayThread,
              canDock,
              createError,
              creating,
              onBlankSubmit: createThreadFromBlank,
              onCloseRail: () => setSummaryOpen(false),
              onCreateEmptyApp:
                scopeAppId || activeThreadId ? undefined : createEmptyApp,
              onSeedConsumed: consumeSeed,
              onSetContainerNode: setContainerNode,
              onSetSummaryOpen: setSummaryOpen,
              onSetWorkspaceOpen,
              onThreadDeleted: handleThreadDeleted,
              scope: composerScope,
              seedMessage: activeThreadId
                ? (seedByThread[activeThreadId] ?? null)
                : null,
              summaryOpen,
              workspaceOpen,
            }}
            isMobile={isMobile}
            panel={panel}
          />
        </AppLayoutPage>
      </AppLayout>
    </TooltipProvider>
  );
}

function ChatMainPane({
  chatProps,
  isMobile,
  panel,
}: {
  chatProps: ChatChromeProps;
  isMobile: boolean;
  panel: ConsolePanel;
}) {
  if (panel.panel === "apps") {
    return <AppsListScreen />;
  }
  if (panel.panel === "app") {
    return <AppDetailScreen appId={panel.appId} />;
  }
  if (isMobile) {
    return <MobileLayout {...chatProps} />;
  }
  return <DesktopLayout {...chatProps} />;
}

interface ChatChromeProps {
  activeThread: Thread | null;
  canDock: boolean;
  createError: string | null;
  creating: boolean;
  onBlankSubmit: (text: string) => void;
  onCloseRail: () => void;
  onCreateEmptyApp?: () => void;
  onSeedConsumed: (threadId: string) => void;
  onSetContainerNode: (node: HTMLElement | null) => void;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onThreadDeleted: (thread: Thread) => void;
  scope: ComposerScope;
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
  onCreateEmptyApp,
  onSeedConsumed,
  onSetContainerNode,
  onSetSummaryOpen,
  onSetWorkspaceOpen,
  onThreadDeleted,
  scope,
  seedMessage,
  summaryOpen,
  workspaceOpen,
}: ChatChromeProps) {
  // The header's copy action needs the transcript's messages, and the two are
  // siblings. A ref keeps the streaming list out of the header's render path.
  const messagesRef = useRef<UIMessage[]>([]);

  return (
    <>
      <ThreadHeader
        activeThread={activeThread}
        onSetSummaryOpen={onSetSummaryOpen}
        onSetWorkspaceOpen={onSetWorkspaceOpen}
        onThreadDeleted={onThreadDeleted}
        readMessages={() => messagesRef.current}
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
              messagesRef={messagesRef}
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
                scope={scope}
              />
              {onCreateEmptyApp ? (
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  or{" "}
                  <button
                    className="text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={creating}
                    onClick={onCreateEmptyApp}
                    type="button"
                  >
                    {creating ? "creating…" : "create an empty app"}
                  </button>
                </p>
              ) : null}
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
  onThreadDeleted,
  readMessages,
  summaryOpen,
  workspaceOpen,
}: {
  activeThread: Thread | null;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onThreadDeleted: (thread: Thread) => void;
  readMessages: () => UIMessage[];
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
            <ThreadHeaderMenu
              onDeleted={onThreadDeleted}
              readMessages={readMessages}
              thread={activeThread}
            />
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
