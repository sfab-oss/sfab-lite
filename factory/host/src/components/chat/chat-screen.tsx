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
import type { MutableRefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createServerThread,
  useAppAgentRegistry,
} from "@/components/chat/app-agent-bridge";
import { useChatData } from "@/components/chat/chat-data-context";
import { WorkPanel } from "@/components/chat/work-panel";
import {
  SecondaryCreateDropZone,
  WorkViewDnd,
} from "@/components/chat/work-view-dnd";
import { WorkViewFooter } from "@/components/chat/work-view-footer";
import { WorkViewHeader } from "@/components/chat/work-view-header";
import {
  useApps,
  useCreateApp,
  useCreateReadyApp,
} from "@/hooks/query/use-apps";
import { useConsoleRoute } from "@/hooks/use-console-route";
import { useConsoleSession } from "@/hooks/use-console-session";
import { useHandleThreadDeleted } from "@/hooks/use-handle-thread-deleted";
import { readyAppsFromList } from "@/lib/api/apps";
import { fetchDefaultWorkspace } from "@/lib/api/workspaces";
import type { Thread } from "@/lib/chat/types";
import {
  type AppLayoutState,
  findTabPanel,
  useAppLayout,
  useWorkspaceTabsStore,
} from "@/lib/chat/workspace-tabs-store";
import type { ComposerScope } from "./composer-scope-chip";
import {
  ResponsiveSidePanel,
  useSidePanelLayout,
} from "./responsive-side-panel";
import { ThreadComposer } from "./thread-composer";
import { ThreadSummaryPanel } from "./thread-summary-panel";
import { ThreadTranscript } from "./thread-transcript";

const TITLE_FIRST_LINE = /\n/;

function titleFromText(text: string): string {
  const first = text.trim().split(TITLE_FIRST_LINE)[0] ?? "New thread";
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
}

function resolveActiveThread(
  activeThreadId: string | null,
  threads: Thread[],
  routeAppId: string | null,
  routeWorkspaceId: string | null,
  scopeAppName: string | null
): Thread | null {
  if (!activeThreadId) {
    return null;
  }
  const found = threads.find((thread) => thread.id === activeThreadId);
  if (found) {
    return found;
  }
  if (!(routeAppId && routeWorkspaceId)) {
    return null;
  }
  return {
    id: activeThreadId,
    appId: routeAppId,
    workspaceId: routeWorkspaceId,
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
    workspaceId: routeWorkspaceId,
    threadId: routeThreadId,
    goWorkHome,
    goChatHome,
    goThread,
  } = route;
  const threads = chatData.listThreads();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const appsQuery = useApps();
  const createApp = useCreateApp();
  const createReadyApp = useCreateReadyApp();
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
  const ensureWorkspace = useWorkspaceTabsStore((s) => s.ensureWorkspace);
  const layout = useAppLayout(routeWorkspaceId ?? "");
  const { canDock, setContainerNode } = useSidePanelLayout();

  const creating = createApp.isPending || createReadyApp.isPending;
  let createError = shellError;
  if (!createError && createApp.error instanceof Error) {
    createError = createApp.error.message;
  } else if (!createError && createReadyApp.error instanceof Error) {
    createError = createReadyApp.error.message;
  }

  useEffect(() => {
    if (routeAppId && routeWorkspaceId && routeThreadId) {
      setActiveThreadId(routeThreadId);
      const known = readyApps.find((app) => app.appId === routeAppId);
      const appName = known?.appName ?? null;
      setScope(routeAppId, appName);
      attend(routeWorkspaceId, routeAppId, appName);
      return;
    }
    if (routeAppId && routeWorkspaceId) {
      const known = readyApps.find((app) => app.appId === routeAppId);
      const appName = known?.appName ?? null;
      setScope(routeAppId, appName);
      attend(routeWorkspaceId, routeAppId, appName);
      setActiveThreadId(null);
      return;
    }
    setActiveThreadId(null);
  }, [
    attend,
    readyApps,
    routeAppId,
    routeThreadId,
    routeWorkspaceId,
    setScope,
  ]);

  useEffect(() => {
    if (!routeWorkspaceId) {
      return;
    }
    ensureWorkspace(routeWorkspaceId);
  }, [ensureWorkspace, routeWorkspaceId]);

  const activeThread = useMemo(
    () =>
      resolveActiveThread(
        activeThreadId,
        threads,
        routeAppId,
        routeWorkspaceId,
        scopeAppName
      ),
    [activeThreadId, routeAppId, routeWorkspaceId, scopeAppName, threads]
  );

  const attendedAppId = activeThread?.appId ?? scopeAppId;

  useEffect(() => {
    chatData.refreshApp(attendedAppId).catch((error: unknown) => {
      console.error("[chat] refreshApp failed", error);
    });
  }, [attendedAppId, chatData]);

  useEffect(() => {
    if (!(activeThreadId && routeWorkspaceId)) {
      return;
    }
    if (!chatData.hasSyncedWorkspace(routeWorkspaceId)) {
      return;
    }
    if (threads.some((thread) => thread.id === activeThreadId)) {
      return;
    }
    setActiveThreadId(null);
    goChatHome();
    setShellError("That conversation no longer exists.");
  }, [activeThreadId, chatData, goChatHome, routeWorkspaceId, threads]);

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
    async (appId: string, appName: string) => {
      setScope(appId, appName);
      setActiveThreadId(null);
      setSummaryOpen(false);
      setShellError(null);
      createApp.reset();
      createReadyApp.reset();
      try {
        const workspace = await fetchDefaultWorkspace(appId);
        attend(workspace.id, appId, appName);
        goWorkHome(appId, workspace.id);
      } catch (error: unknown) {
        setShellError(error instanceof Error ? error.message : String(error));
      }
    },
    [attend, createApp, createReadyApp, goWorkHome, setScope]
  );

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setSummaryOpen(false);
    setShellError(null);
    createApp.reset();
    createReadyApp.reset();
    if (routeAppId && routeWorkspaceId) {
      goWorkHome(routeAppId, routeWorkspaceId);
      return;
    }
    clearScope();
    clearAttention();
    goChatHome();
  }, [
    clearAttention,
    clearScope,
    createApp,
    createReadyApp,
    goWorkHome,
    goChatHome,
    routeAppId,
    routeWorkspaceId,
  ]);

  const createThreadFromBlank = useCallback(
    async (text: string) => {
      if (createApp.isPending || createReadyApp.isPending) {
        return;
      }
      setShellError(null);
      createApp.reset();
      createReadyApp.reset();
      try {
        let appId = scopedApp?.appId ?? null;
        let appName: string | null = scopedApp?.appName ?? null;
        if (!appId) {
          const created = await createReadyApp.mutateAsync(undefined);
          appId = created.appId;
          appName = created.name;
        }
        const workspace =
          routeWorkspaceId && routeAppId === appId
            ? { id: routeWorkspaceId }
            : await fetchDefaultWorkspace(appId);
        setScope(appId, appName);
        attend(workspace.id, appId, appName);
        const handle = await waitForHandle(workspace.id);
        const summary = await createServerThread(handle, {
          title: titleFromText(text),
        });
        const thread: Thread = {
          id: summary.id,
          appId,
          workspaceId: workspace.id,
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
        goThread(appId, workspace.id, summary.id);
      } catch (error: unknown) {
        setShellError(error instanceof Error ? error.message : String(error));
      }
    },
    [
      attend,
      chatData,
      createApp,
      createReadyApp,
      goThread,
      routeAppId,
      routeWorkspaceId,
      scopedApp,
      setScope,
      setThreadSeed,
      waitForHandle,
    ]
  );

  const createEmptyApp = useCallback(async () => {
    if (createApp.isPending || createReadyApp.isPending) {
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
  }, [createApp, createReadyApp, navigate]);

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
    if (!routeWorkspaceId) {
      return [];
    }
    return threads
      .filter((thread) => thread.workspaceId === routeWorkspaceId)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [routeWorkspaceId, threads]);

  const displayThread =
    activeThread && activeThread.title === "Loading…"
      ? (threads.find((thread) => thread.id === activeThread.id) ??
        activeThread)
      : activeThread;

  const chatBodyProps: ChatBodyProps = {
    activeThread: displayThread,
    canDock,
    createError,
    creating,
    onBlankSubmit: createThreadFromBlank,
    onCloseRail: () => setSummaryOpen(false),
    onCreateEmptyApp:
      routeAppId || scopeAppId || activeThreadId ? undefined : createEmptyApp,
    onSeedConsumed: consumeThreadSeed,
    onSetContainerNode: setContainerNode,
    scope: composerScope,
    seedMessage: activeThreadId ? (seedByThread[activeThreadId] ?? null) : null,
    summaryOpen,
  };

  const messagesRef = useRef<UIMessage[]>([]);
  const chatBody = <ChatBody {...chatBodyProps} messagesRef={messagesRef} />;

  if (!(routeAppId && routeWorkspaceId)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatBody {...chatBodyProps} messagesRef={messagesRef} />
      </div>
    );
  }

  return (
    <WorkViewShell
      appId={routeAppId}
      appThreads={appThreads}
      chatBody={chatBody}
      isMobile={isMobile}
      layout={layout}
      messagesRef={messagesRef}
      onNewThread={goHome}
      onSelectThread={(threadId) =>
        goThread(routeAppId, routeWorkspaceId, threadId)
      }
      onSetSummaryOpen={setSummaryOpen}
      onThreadDeleted={handleThreadDeleted}
      summaryOpen={summaryOpen}
      thread={displayThread}
      workspaceId={routeWorkspaceId}
    />
  );
}

function WorkViewShell({
  appId,
  workspaceId,
  appThreads,
  chatBody,
  isMobile,
  layout,
  messagesRef,
  onNewThread,
  onSelectThread,
  onSetSummaryOpen,
  onThreadDeleted,
  summaryOpen,
  thread,
}: {
  appId: string;
  workspaceId: string;
  appThreads: Thread[];
  chatBody: ReactNode;
  isMobile: boolean;
  layout: AppLayoutState;
  messagesRef: MutableRefObject<UIMessage[]>;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onThreadDeleted: (thread: Thread) => void;
  summaryOpen: boolean;
  thread: Thread | null;
}) {
  const focusPanel = useWorkspaceTabsStore((s) => s.focusPanel);
  const chatPanel = findTabPanel(layout, "chat");
  const secondaryOpen = layout.secondary !== null;
  const secondarySheetOpen =
    secondaryOpen && layout.focusedPanel === "secondary";

  const header = (
    <WorkViewHeader
      activeThread={thread}
      appId={appId}
      appThreads={appThreads}
      onNewThread={onNewThread}
      onSelectThread={onSelectThread}
      onSetSummaryOpen={onSetSummaryOpen}
      onThreadDeleted={onThreadDeleted}
      readMessages={() => messagesRef.current}
      summaryOpen={summaryOpen}
    />
  );

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <WorkViewDnd workspaceId={workspaceId}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkPanel
              workspaceId={workspaceId}
              chat={chatPanel === "primary" ? chatBody : null}
              focused={layout.focusedPanel === "primary"}
              panel="primary"
              state={layout.primary}
            />
          </div>
          <Sheet
            onOpenChange={(open) => {
              if (!(workspaceId && layout.secondary)) {
                return;
              }
              focusPanel(workspaceId, open ? "secondary" : "primary");
            }}
            open={secondarySheetOpen}
          >
            <SheetContent
              className="flex h-svh flex-col gap-0 overflow-hidden p-0 data-[side=right]:w-[calc(100%-2.5rem)] data-[side=right]:max-w-none data-[side=right]:sm:max-w-none [&>button]:hidden"
              side="right"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Side panel</SheetTitle>
              </SheetHeader>
              {layout.secondary ? (
                <WorkPanel
                  workspaceId={workspaceId}
                  chat={chatPanel === "secondary" ? chatBody : null}
                  focused
                  panel="secondary"
                  state={layout.secondary}
                />
              ) : null}
            </SheetContent>
          </Sheet>
        </WorkViewDnd>
        <WorkViewFooter workspaceId={workspaceId} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <WorkViewDnd workspaceId={workspaceId}>
        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            className="min-h-0 flex-1"
            direction="horizontal"
          >
            <ResizablePanel
              className="flex min-h-0 flex-col"
              defaultSize={secondaryOpen ? 55 : 100}
              minSize={secondaryOpen ? 28 : 40}
            >
              <WorkPanel
                workspaceId={workspaceId}
                chat={chatPanel === "primary" ? chatBody : null}
                className={
                  secondaryOpen
                    ? "overflow-hidden rounded-r-none"
                    : "overflow-hidden"
                }
                focused={layout.focusedPanel === "primary"}
                panel="primary"
                sortable
                state={layout.primary}
              />
            </ResizablePanel>
            {secondaryOpen && layout.secondary ? (
              <>
                <ResizableHandle className="bg-transparent" />
                <ResizablePanel
                  className="ml-px flex min-h-0 flex-col overflow-hidden rounded-l-xl border-border border-l bg-accent/5 shadow"
                  defaultSize={45}
                  maxSize={70}
                  minSize={22}
                >
                  <WorkPanel
                    workspaceId={workspaceId}
                    chat={chatPanel === "secondary" ? chatBody : null}
                    focused={layout.focusedPanel === "secondary"}
                    panel="secondary"
                    sortable
                    state={layout.secondary}
                  />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
          {secondaryOpen ? null : <SecondaryCreateDropZone />}
        </div>
      </WorkViewDnd>
      <WorkViewFooter workspaceId={workspaceId} />
    </div>
  );
}

interface ChatBodyProps {
  activeThread: Thread | null;
  canDock: boolean;
  createError: string | null;
  creating: boolean;
  onBlankSubmit: (text: string) => void;
  onCloseRail: () => void;
  onCreateEmptyApp?: () => void;
  onSeedConsumed: (threadId: string) => void;
  onSetContainerNode: (node: HTMLElement | null) => void;
  scope?: ComposerScope;
  seedMessage: string | null;
  summaryOpen: boolean;
}

function ChatBody({
  activeThread,
  canDock,
  createError,
  creating,
  onBlankSubmit,
  onCloseRail,
  onCreateEmptyApp,
  onSeedConsumed,
  onSetContainerNode,
  scope,
  seedMessage,
  summaryOpen,
  messagesRef,
}: ChatBodyProps & {
  messagesRef: MutableRefObject<UIMessage[]>;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col transition-[justify-content] duration-300 ease-out"
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
              Start a new conversation, or open history from the header.
            </p>
          </div>
          <div className="w-full max-w-3xl">
            <ThreadComposer
              onStop={() => undefined}
              onSubmit={onBlankSubmit}
              placeholder={
                creating ? "Creating app…" : "Describe what you want to change…"
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
  );
}
