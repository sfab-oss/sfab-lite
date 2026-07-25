import { ListTree, PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { MOCK_THREADS, type MockThread } from "./lib/mock-threads";
import { useWorkspaceTabsStore } from "./lib/workspace-tabs-store";

const TITLE_FIRST_LINE = /\n/;

function titleFromText(text: string): string {
  const first = text.trim().split(TITLE_FIRST_LINE)[0] ?? "New thread";
  return first.length > 64 ? `${first.slice(0, 61)}…` : first;
}

export function ChatScreen() {
  const isMobile = useIsMobile();
  const { route, navigate } = useRouter();
  const [search, setSearch] = useState("");
  const [threads, setThreads] = useState<MockThread[]>(MOCK_THREADS);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [seedByThread, setSeedByThread] = useState<Record<string, string>>({});
  const [scopeAppId, setScopeAppId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const workspaceOpen = useWorkspaceTabsStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useWorkspaceTabsStore((s) => s.setWorkspaceOpen);
  const openAgentRunTab = useWorkspaceTabsStore((s) => s.openAgentRunTab);
  const { canDock, setContainerNode } = useSidePanelLayout();

  useEffect(() => {
    if (route.name === "dev-chat") {
      setActiveThreadId(route.threadId ?? null);
      return;
    }
    if (route.name === "thread") {
      setActiveThreadId((current) =>
        current === route.threadId ? current : route.threadId
      );
      return;
    }
    if (route.name === "app") {
      setScopeAppId(route.appId);
      setActiveThreadId(null);
      navigate({ name: "chat" }, true);
      return;
    }
    if (route.name === "chat" || route.name === "apps") {
      setActiveThreadId(null);
    }
  }, [navigate, route]);

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && route.name === "dev-chat") {
      navigate({ name: "dev-chat" });
      return;
    }
    navigate({ name: "chat" });
  }, [navigate, route.name]);

  const goThread = useCallback(
    (threadId: string) => {
      if (import.meta.env.DEV && route.name === "dev-chat") {
        navigate({ name: "dev-chat", threadId });
        return;
      }
      navigate({ name: "thread", threadId });
    },
    [navigate, route.name]
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );

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
    const sample = threads.find((thread) => thread.appId === scopeAppId);
    return sample
      ? { appId: sample.appId, appName: sample.appName }
      : { appId: scopeAppId, appName: scopeAppId };
  }, [activeThread, scopeAppId, threads]);

  const selectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((entry) => entry.id === threadId);
      if (thread?.appId) {
        setScopeAppId(thread.appId);
      }
      setActiveThreadId(threadId);
      setSummaryOpen(false);
      goThread(threadId);
    },
    [goThread, threads]
  );

  const goHome = useCallback(() => {
    setActiveThreadId(null);
    setScopeAppId(null);
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    goChatHome();
  }, [goChatHome, setWorkspaceOpen]);

  const newThread = useCallback(() => {
    if (activeThread?.appId) {
      setScopeAppId(activeThread.appId);
    }
    setActiveThreadId(null);
    setSummaryOpen(false);
    setWorkspaceOpen(false);
    goChatHome();
  }, [activeThread, goChatHome, setWorkspaceOpen]);

  const createThreadFromBlank = useCallback(
    (text: string) => {
      const id = `thr_${crypto.randomUUID().slice(0, 8)}`;
      const fromHome = !scopedApp?.appId;
      const appId =
        scopedApp?.appId ?? `app_${crypto.randomUUID().slice(0, 8)}`;
      const appName = scopedApp?.appName ?? titleFromText(text);
      const thread: MockThread = {
        id,
        appId,
        appName,
        readOnly: false,
        status: "running",
        title: titleFromText(text),
        headline: fromHome ? "Creating app…" : "Starting…",
        startedLabel: "just now",
        startedMinutesAgo: 0,
        updatedLabel: "now",
        updatedMinutesAgo: 0,
      };
      setThreads((current) => [thread, ...current]);
      setSeedByThread((current) => ({ ...current, [id]: text }));
      setScopeAppId(appId);
      setActiveThreadId(id);
      goThread(id);
    },
    [goThread, scopedApp]
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

  const openAgentRun = (runId: string) => {
    if (!activeThreadId) {
      return;
    }
    openAgentRunTab(activeThreadId, runId);
  };

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

  return (
    <TooltipProvider>
      <AppLayout
        sidebar={
          <SessionThreadsSidebar
            activeThreadId={activeThreadId}
            homeActive={
              activeThreadId === null &&
              (route.name === "chat" ||
                route.name === "apps" ||
                (route.name === "dev-chat" && !route.threadId))
            }
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
              activeThread={activeThread}
              canDock={canDock}
              onBlankSubmit={createThreadFromBlank}
              onCloseRail={() => setSummaryOpen(false)}
              onOpenAgentRun={openAgentRun}
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
              activeThread={activeThread}
              canDock={canDock}
              onBlankSubmit={createThreadFromBlank}
              onCloseRail={() => setSummaryOpen(false)}
              onOpenAgentRun={openAgentRun}
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
  activeThread: MockThread | null;
  canDock: boolean;
  onBlankSubmit: (text: string) => void;
  onCloseRail: () => void;
  onOpenAgentRun: (runId: string) => void;
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
  onBlankSubmit,
  onCloseRail,
  onOpenAgentRun,
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
            panel={
              <ThreadSummaryPanel
                onOpenAgentRun={onOpenAgentRun}
                thread={activeThread}
              />
            }
          >
            <ThreadTranscript
              initialMessage={seedMessage ?? undefined}
              key={activeThread.id}
              onInitialConsumed={() => onSeedConsumed(activeThread.id)}
              onOpenAgentRun={onOpenAgentRun}
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
                placeholder="Describe the app you want to build…"
                running={false}
              />
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
  activeThread: MockThread | null;
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
