import { useMatch, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export interface ConsoleRoute {
  appId: string | null;
  threadId: string | null;
  isDevChat: boolean;
  appsRoute: boolean;
  appDashboardId: string | null;
  goAgentHome: (appId: string) => void;
  goChatHome: () => void;
  goThread: (appId: string, threadId: string) => void;
}

export function useConsoleRoute(): ConsoleRoute {
  const navigate = useNavigate();
  const agentThread = useMatch({
    from: "/_protected/apps/$appId/agent/$threadId",
    shouldThrow: false,
  });
  const agentLayout = useMatch({
    from: "/_protected/apps/$appId/agent",
    shouldThrow: false,
  });
  const legacyThread = useMatch({
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
  const appLayout = useMatch({
    from: "/_protected/apps/$appId",
    shouldThrow: false,
  });
  const appsIndex = useMatch({
    from: "/_protected/apps/",
    shouldThrow: false,
  });

  const threadMatch = agentThread ?? legacyThread ?? devThread;
  const threadId = threadMatch?.params.threadId ?? null;
  const appId = threadMatch?.params.appId ?? agentLayout?.params.appId ?? null;

  const appsRoute = Boolean(appLayout) || Boolean(appsIndex);
  const appDashboardId = appLayout?.params.appId ?? null;

  const goAgentHome = useCallback(
    (nextAppId: string) => {
      if (import.meta.env.DEV && isDevChat) {
        navigate({ to: "/dev/chat" });
        return;
      }
      navigate({
        to: "/apps/$appId/agent",
        params: { appId: nextAppId },
      });
    },
    [isDevChat, navigate]
  );

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && isDevChat) {
      navigate({ to: "/dev/chat" });
      return;
    }
    const scoped = appId ?? appLayout?.params.appId ?? null;
    if (scoped) {
      navigate({
        to: "/apps/$appId/agent",
        params: { appId: scoped },
      });
      return;
    }
    navigate({ to: "/apps" });
  }, [appId, appLayout?.params.appId, isDevChat, navigate]);

  const goThread = useCallback(
    (nextAppId: string, nextThreadId: string) => {
      if (import.meta.env.DEV && isDevChat) {
        navigate({
          to: "/dev/chat/apps/$appId/t/$threadId",
          params: { appId: nextAppId, threadId: nextThreadId },
        });
        return;
      }
      navigate({
        to: "/apps/$appId/agent/$threadId",
        params: { appId: nextAppId, threadId: nextThreadId },
      });
    },
    [isDevChat, navigate]
  );

  return useMemo(
    () => ({
      appId,
      threadId,
      isDevChat,
      appsRoute,
      appDashboardId,
      goAgentHome,
      goChatHome,
      goThread,
    }),
    [
      appDashboardId,
      appId,
      appsRoute,
      goAgentHome,
      goChatHome,
      goThread,
      isDevChat,
      threadId,
    ]
  );
}
