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
import { useIsMobile } from "@sfab-lite/ui/hooks/use-mobile";
import { useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { ListTree, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readyAppsFromList, useApps, useCreateApp } from "@/hooks/use-apps";
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
import { useConsoleSession } from "./console-session";
import {
  createServerThread,
  useAppAgentRegistry,
} from "./data/app-agent-bridge";
import { useChatData } from "./data/chat-data-context";
import { useWorkspaceTabsStore } from "./lib/workspace-tabs-store";
import { formatRelativeTime } from "./model/thread-list";
import type { Thread } from "./model/types";
import { useConsoleRoute } from "./use-console-route";
import { useHandleThreadDeleted } from "./use-handle-thread-deleted";

const TITLE_FIRST_LINE = /\n/;

function titleFromText(text: string): string {
  const first = text.trim().split(TITLE_FIRST_LINE)[0] ?? "New thread";
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
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

/** Chat home / thread chrome. Expects ConsoleProviders + ConsoleShell above. */
export function ChatScreen() {
  const chatData = useChatData();
  const { attend, clearAttention, waitForHandle } = useAppAgentRegistry();
  const {
    scopeAppId,
    scopeAppName,
    setScope,
    clearScope,
    seedByThread,
    setThreadSeed,
    consumeThreadSeed,
  } = useConsoleSession();
  const route = useConsoleRoute();
  const {
    appId: routeAppId,
    threadId: routeThreadId,
    goAgentHome,
    goChatHome,
    goThread,
  } = route;
  const threads = chatData.listThreads();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const appsQuery = useApps();
  const createApp = useCreateApp();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    routeThreadId
  );
  const handleThreadDeleted = useHandleThreadDeleted(activeThreadId);
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

  useEffect(() => {
    if (routeAppId && routeThreadId) {
      setActiveThreadId(routeThreadId);
      const known = readyApps.find((app) => app.appId === routeAppId);
      const appName = known?.appName ?? null;
      setScope(routeAppId, appName);
      attend(routeAppId, appName);
      return;
    }
    if (routeAppId) {
      const known = readyApps.find((app) => app.appId === routeAppId);
      const appName = known?.appName ?? null;
      setScope(routeAppId, appName);
      attend(routeAppId, appName);
      setActiveThreadId(null);
      return;
    }
    setActiveThreadId(null);
  }, [attend, readyApps, routeAppId, routeThreadId, setScope]);

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

  const attendApp = useCallback(
    (appId: string, appName: string) => {
      setScope(appId, appName);
      attend(appId, appName);
      setActiveThreadId(null);
      setSummaryOpen(false);
      setWorkspaceOpen(false);
      setShellError(null);
      createApp.reset();
      goAgentHome(appId);
    },
    [attend, createApp, goAgentHome, setScope, setWorkspaceOpen]
  );

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    setShellError(null);
    createApp.reset();
    if (routeAppId) {
      goAgentHome(routeAppId);
      return;
    }
    clearScope();
    clearAttention();
    goChatHome();
  }, [
    clearAttention,
    clearScope,
    createApp,
    goAgentHome,
    goChatHome,
    routeAppId,
    setWorkspaceOpen,
  ]);

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
        setScope(appId, appName);
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
        setThreadSeed(summary.id, text);
        setActiveThreadId(summary.id);
        goThread(appId, summary.id);
      } catch (error: unknown) {
        setShellError(error instanceof Error ? error.message : String(error));
      }
    },
    [
      attend,
      chatData,
      createApp,
      goThread,
      scopedApp,
      setScope,
      setThreadSeed,
      waitForHandle,
    ]
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

  const composerScope = useMemo<ComposerScope | undefined>(() => {
    if (routeAppId) {
      return;
    }
    return {
      appId: scopeAppId,
      appName: scopedApp?.appName ?? scopeAppName,
      apps: readyApps,
      onAttendApp: attendApp,
      onClearScope: goHome,
    };
  }, [
    attendApp,
    goHome,
    readyApps,
    routeAppId,
    scopeAppId,
    scopeAppName,
    scopedApp,
  ]);

  const appThreads = useMemo(() => {
    if (!routeAppId) {
      return [];
    }
    return threads
      .filter((thread) => thread.appId === routeAppId)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [routeAppId, threads]);

  const onSetWorkspaceOpen = (
    value: boolean | ((open: boolean) => boolean)
  ) => {
    setWorkspaceOpen(
      typeof value === "function" ? value(workspaceOpen) : value
    );
  };

  const displayThread =
    activeThread && activeThread.title === "Loading…"
      ? (threads.find((thread) => thread.id === activeThread.id) ??
        activeThread)
      : activeThread;

  const chatProps: ChatChromeProps = {
    activeThread: displayThread,
    appThreads,
    canDock,
    createError,
    creating,
    onBlankSubmit: createThreadFromBlank,
    onCloseRail: () => setSummaryOpen(false),
    onCreateEmptyApp:
      routeAppId || scopeAppId || activeThreadId ? undefined : createEmptyApp,
    onSelectThread: (threadId) => {
      if (!routeAppId) {
        return;
      }
      goThread(routeAppId, threadId);
    },
    onSeedConsumed: consumeThreadSeed,
    onSetContainerNode: setContainerNode,
    onSetSummaryOpen: setSummaryOpen,
    onSetWorkspaceOpen,
    onThreadDeleted: handleThreadDeleted,
    scope: composerScope,
    seedMessage: activeThreadId ? (seedByThread[activeThreadId] ?? null) : null,
    summaryOpen,
    workspaceOpen,
  };

  if (isMobile) {
    return <MobileLayout {...chatProps} />;
  }
  return <DesktopLayout {...chatProps} />;
}

interface ChatChromeProps {
  activeThread: Thread | null;
  appThreads: Thread[];
  canDock: boolean;
  createError: string | null;
  creating: boolean;
  onBlankSubmit: (text: string) => void;
  onCloseRail: () => void;
  onCreateEmptyApp?: () => void;
  onSelectThread: (threadId: string) => void;
  onSeedConsumed: (threadId: string) => void;
  onSetContainerNode: (node: HTMLElement | null) => void;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onThreadDeleted: (thread: Thread) => void;
  scope?: ComposerScope;
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
  appThreads,
  canDock,
  createError,
  creating,
  onBlankSubmit,
  onCloseRail,
  onCreateEmptyApp,
  onSelectThread,
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
                Start a new conversation or open a thread below.
              </p>
            </div>
            <div className="w-full max-w-3xl">
              <ThreadComposer
                onStop={() => undefined}
                onSubmit={onBlankSubmit}
                placeholder={
                  creating
                    ? "Creating app…"
                    : "Describe what you want to change…"
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
              {appThreads.length > 0 ? (
                <ul className="mt-8 flex list-none flex-col gap-1 border-border border-t p-0 pt-6">
                  <li className="mb-1 px-1 text-muted-foreground text-xs">
                    Threads
                  </li>
                  {appThreads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => onSelectThread(thread.id)}
                        type="button"
                      >
                        <span className="min-w-0 truncate font-medium">
                          {thread.title}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {formatRelativeTime(thread.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
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
  if (!activeThread) {
    return null;
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3">
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
      <div className="ml-auto flex items-center gap-2">
        <Button
          aria-label={summaryOpen ? "Hide summary panel" : "Show summary panel"}
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
      </div>
    </div>
  );
}
