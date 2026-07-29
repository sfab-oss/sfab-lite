import { TooltipProvider } from "@sfab-lite/ui/components/shadcn/tooltip";
import {
  Outlet,
  useMatch,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AppLayout, AppLayoutPage } from "@/components/brand/app-layout";
import { readyAppsFromList, useApps } from "@/hooks/use-apps";
import { SessionThreadsSidebar } from "./components/threads-sidebar";
import {
  AppAgentRegistryProvider,
  useAppAgentRegistry,
} from "./data/app-agent-bridge";
import { ChatDataProvider, useChatData } from "./data/chat-data-context";
import {
  createRealChatData,
  type RealChatData,
} from "./data/create-real-chat-data";
import type { Thread } from "./model/types";

interface ConsoleSessionValue {
  scopeAppId: string | null;
  scopeAppName: string | null;
  setScope: (appId: string | null, appName: string | null) => void;
  clearScope: () => void;
  seedByThread: Record<string, string>;
  setThreadSeed: (threadId: string, text: string) => void;
  consumeThreadSeed: (threadId: string) => void;
  clearThreadSeed: (threadId: string) => void;
}

const ConsoleSessionContext = createContext<ConsoleSessionValue | null>(null);

export function useConsoleSession(): ConsoleSessionValue {
  const value = useContext(ConsoleSessionContext);
  if (!value) {
    throw new Error("useConsoleSession requires ConsoleProviders");
  }
  return value;
}

export function ConsoleProviders({ children }: { children: ReactNode }) {
  const [chatData] = useState<RealChatData>(() => createRealChatData());
  const [scopeAppId, setScopeAppId] = useState<string | null>(null);
  const [scopeAppName, setScopeAppName] = useState<string | null>(null);
  const [seedByThread, setSeedByThread] = useState<Record<string, string>>({});

  const setScope = useCallback(
    (appId: string | null, appName: string | null) => {
      setScopeAppId(appId);
      setScopeAppName(appName);
    },
    []
  );

  const clearScope = useCallback(() => {
    setScopeAppId(null);
    setScopeAppName(null);
  }, []);

  const setThreadSeed = useCallback((threadId: string, text: string) => {
    setSeedByThread((current) => ({ ...current, [threadId]: text }));
  }, []);

  const consumeThreadSeed = useCallback((threadId: string) => {
    setSeedByThread((current) => {
      if (!(threadId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }, []);

  const clearThreadSeed = consumeThreadSeed;

  const session = useMemo(
    () => ({
      scopeAppId,
      scopeAppName,
      setScope,
      clearScope,
      seedByThread,
      setThreadSeed,
      consumeThreadSeed,
      clearThreadSeed,
    }),
    [
      clearScope,
      clearThreadSeed,
      consumeThreadSeed,
      scopeAppId,
      scopeAppName,
      seedByThread,
      setScope,
      setThreadSeed,
    ]
  );

  return (
    <ChatDataProvider value={chatData}>
      <AppAgentRegistryProvider>
        <ConsoleSessionContext.Provider value={session}>
          {children}
        </ConsoleSessionContext.Provider>
      </AppAgentRegistryProvider>
    </ChatDataProvider>
  );
}

export function ConsoleShell({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <AppLayout sidebar={<ConsoleSidebar />}>
        <AppLayoutPage>{children ?? <Outlet />}</AppLayoutPage>
      </AppLayout>
    </TooltipProvider>
  );
}

function ConsoleSidebar() {
  const chatData = useChatData();
  const threads = chatData.listThreads();
  const { attend, clearAttention } = useAppAgentRegistry();
  const { setScope, clearScope } = useConsoleSession();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const appsQuery = useApps();
  const [search, setSearch] = useState("");

  const protectedThread = useMatch({
    from: "/_protected/apps/$appId/t/$threadId",
    shouldThrow: false,
  });
  const devThread = useMatch({
    from: "/dev/chat/apps/$appId/t/$threadId",
    shouldThrow: false,
  });
  const isDevChat = Boolean(
    useMatch({ from: "/dev/chat", shouldThrow: false })
  );

  const threadMatch = protectedThread ?? devThread;
  const appParams =
    threadMatch || isDevChat
      ? false
      : matchRoute({ to: "/apps/$appId", fuzzy: false });
  const appsRoute =
    Boolean(appParams) ||
    (!isDevChat && Boolean(matchRoute({ to: "/apps", fuzzy: false })));

  const readyApps = useMemo(
    () => readyAppsFromList(appsQuery.data?.apps),
    [appsQuery.data?.apps]
  );

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && isDevChat) {
      navigate({ to: "/dev/chat" });
      return;
    }
    navigate({ to: "/" });
  }, [isDevChat, navigate]);

  const goHome = useCallback(() => {
    clearScope();
    clearAttention();
    goChatHome();
  }, [clearAttention, clearScope, goChatHome]);

  const newThread = useCallback(() => {
    goChatHome();
  }, [goChatHome]);

  const selectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((entry) => entry.id === threadId);
      if (!thread?.appId) {
        return;
      }
      setScope(thread.appId, thread.appName);
      attend(thread.appId, thread.appName);
      if (import.meta.env.DEV && isDevChat) {
        navigate({
          to: "/dev/chat/apps/$appId/t/$threadId",
          params: { appId: thread.appId, threadId },
        });
        return;
      }
      navigate({
        to: "/apps/$appId/t/$threadId",
        params: { appId: thread.appId, threadId },
      });
    },
    [attend, isDevChat, navigate, setScope, threads]
  );

  const handleThreadDeleted = useCallback(
    (thread: Thread) => {
      const viewing = threadMatch?.params.threadId === thread.id;
      if (!viewing) {
        return;
      }
      const appName =
        thread.appName ??
        readyApps.find((app) => app.appId === thread.appId)?.appName ??
        null;
      if (thread.appId) {
        setScope(thread.appId, appName);
        attend(thread.appId, appName);
        goChatHome();
        return;
      }
      goHome();
    },
    [attend, goChatHome, goHome, readyApps, setScope, threadMatch]
  );

  const onSignOut = () => {
    navigate({ to: "/signin", replace: true });
  };

  const homeActive = !(appsRoute || threadMatch);

  return (
    <SessionThreadsSidebar
      activeAppId={appParams ? appParams.appId : null}
      activeThreadId={appsRoute ? null : (threadMatch?.params.threadId ?? null)}
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
  );
}
