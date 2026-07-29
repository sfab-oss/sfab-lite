import { useMatch, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export interface ConsoleRoute {
  appId: string | null;
  threadId: string | null;
  isDevChat: boolean;
  appsRoute: boolean;
  appDashboardId: string | null;
  homeActive: boolean;
  goChatHome: () => void;
  goThread: (appId: string, threadId: string) => void;
}

export function useConsoleRoute(): ConsoleRoute {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
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
  const appId = threadMatch?.params.appId ?? null;
  const threadId = threadMatch?.params.threadId ?? null;

  const appDashboard =
    threadMatch || isDevChat
      ? false
      : matchRoute({ to: "/apps/$appId", fuzzy: false });
  const appsRoute =
    Boolean(appDashboard) ||
    (!isDevChat && Boolean(matchRoute({ to: "/apps", fuzzy: false })));
  const appDashboardId =
    appDashboard && typeof appDashboard === "object"
      ? appDashboard.appId
      : null;

  const goChatHome = useCallback(() => {
    if (import.meta.env.DEV && isDevChat) {
      navigate({ to: "/dev/chat" });
      return;
    }
    navigate({ to: "/" });
  }, [isDevChat, navigate]);

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
        to: "/apps/$appId/t/$threadId",
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
      homeActive: !(appsRoute || threadMatch),
      goChatHome,
      goThread,
    }),
    [
      appDashboardId,
      appId,
      appsRoute,
      goChatHome,
      goThread,
      isDevChat,
      threadId,
      threadMatch,
    ]
  );
}
