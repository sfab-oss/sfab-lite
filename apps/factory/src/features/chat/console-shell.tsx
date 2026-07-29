import { TooltipProvider } from "@sfab-lite/ui/components/shadcn/tooltip";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { AppLayout, AppLayoutPage } from "@/components/brand/app-layout";
import { readyAppsFromList, useApps } from "@/hooks/use-apps";
import { SessionThreadsSidebar } from "./components/threads-sidebar";
import { useConsoleSession } from "./console-session";
import { useAppAgentRegistry } from "./data/app-agent-bridge";
import { useChatData } from "./data/chat-data-context";
import { useConsoleRoute } from "./use-console-route";
import { useHandleThreadDeleted } from "./use-handle-thread-deleted";

export { ConsoleProviders } from "./console-session";

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
  const route = useConsoleRoute();
  const appsQuery = useApps();
  const [search, setSearch] = useState("");
  const handleThreadDeleted = useHandleThreadDeleted(route.threadId);

  const readyApps = useMemo(
    () => readyAppsFromList(appsQuery.data?.apps),
    [appsQuery.data?.apps]
  );

  const goHome = useCallback(() => {
    clearScope();
    clearAttention();
    route.goChatHome();
  }, [clearAttention, clearScope, route]);

  const newThread = useCallback(() => {
    route.goChatHome();
  }, [route]);

  const selectThread = useCallback(
    (threadId: string) => {
      const thread = threads.find((entry) => entry.id === threadId);
      if (!thread?.appId) {
        return;
      }
      setScope(thread.appId, thread.appName);
      attend(thread.appId, thread.appName);
      route.goThread(thread.appId, threadId);
    },
    [attend, route, setScope, threads]
  );

  const onSignOut = () => {
    navigate({ to: "/signin", replace: true });
  };

  return (
    <SessionThreadsSidebar
      activeAppId={route.appDashboardId}
      activeThreadId={route.appsRoute ? null : route.threadId}
      appsActive={route.appsRoute}
      homeActive={route.homeActive}
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
