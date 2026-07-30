import { useMatch, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export interface ConsoleRoute {
  appId: string | null;
  threadId: string | null;
  appsRoute: boolean;
  appDashboardId: string | null;
  goWorkHome: (appId: string) => void;
  goChatHome: () => void;
  goThread: (appId: string, threadId: string) => void;
}

export function useConsoleRoute(): ConsoleRoute {
  const navigate = useNavigate();
  const workThread = useMatch({
    from: "/_protected/apps/$appId/work/$threadId",
    shouldThrow: false,
  });
  const workLayout = useMatch({
    from: "/_protected/apps/$appId/work",
    shouldThrow: false,
  });
  const legacyThread = useMatch({
    from: "/_protected/apps/$appId/t/$threadId",
    shouldThrow: false,
  });
  const appLayout = useMatch({
    from: "/_protected/apps/$appId",
    shouldThrow: false,
  });
  const appsIndex = useMatch({
    from: "/_protected/apps/",
    shouldThrow: false,
  });

  const threadMatch = workThread ?? legacyThread;
  const threadId = threadMatch?.params.threadId ?? null;
  const appId = threadMatch?.params.appId ?? workLayout?.params.appId ?? null;

  const appsRoute = Boolean(appLayout) || Boolean(appsIndex);
  const appDashboardId = appLayout?.params.appId ?? null;

  const goWorkHome = useCallback(
    (nextAppId: string) => {
      navigate({
        to: "/apps/$appId/work",
        params: { appId: nextAppId },
      });
    },
    [navigate]
  );

  const goChatHome = useCallback(() => {
    const scoped = appId ?? appLayout?.params.appId ?? null;
    if (scoped) {
      navigate({
        to: "/apps/$appId/work",
        params: { appId: scoped },
      });
      return;
    }
    navigate({ to: "/apps" });
  }, [appId, appLayout?.params.appId, navigate]);

  const goThread = useCallback(
    (nextAppId: string, nextThreadId: string) => {
      navigate({
        to: "/apps/$appId/work/$threadId",
        params: { appId: nextAppId, threadId: nextThreadId },
      });
    },
    [navigate]
  );

  return useMemo(
    () => ({
      appId,
      threadId,
      appsRoute,
      appDashboardId,
      goWorkHome,
      goChatHome,
      goThread,
    }),
    [
      appDashboardId,
      appId,
      appsRoute,
      goWorkHome,
      goChatHome,
      goThread,
      threadId,
    ]
  );
}
