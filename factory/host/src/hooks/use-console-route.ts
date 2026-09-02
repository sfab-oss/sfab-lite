import { useMatch, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export interface ConsoleRoute {
  appId: string | null;
  workspaceId: string | null;
  threadId: string | null;
  appsRoute: boolean;
  appDashboardId: string | null;
  goWorkHome: (appId: string, workspaceId: string) => void;
  goChatHome: () => void;
  goThread: (appId: string, workspaceId: string, threadId: string) => void;
}

export function useConsoleRoute(): ConsoleRoute {
  const navigate = useNavigate();
  const workThread = useMatch({
    from: "/_protected/apps/$appId/workspaces/$workspaceId/work/$threadId",
    shouldThrow: false,
  });
  const workLayout = useMatch({
    from: "/_protected/apps/$appId/workspaces/$workspaceId/work",
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

  const threadId = workThread?.params.threadId ?? null;
  const workspaceId =
    workThread?.params.workspaceId ?? workLayout?.params.workspaceId ?? null;
  const appId = workThread?.params.appId ?? workLayout?.params.appId ?? null;

  const appsRoute = Boolean(appLayout) || Boolean(appsIndex);
  const appDashboardId = appLayout?.params.appId ?? null;

  const goWorkHome = useCallback(
    (nextAppId: string, nextWorkspaceId: string) => {
      navigate({
        to: "/apps/$appId/workspaces/$workspaceId/work",
        params: { appId: nextAppId, workspaceId: nextWorkspaceId },
      });
    },
    [navigate]
  );

  const goChatHome = useCallback(() => {
    const scopedApp = appId ?? appLayout?.params.appId ?? null;
    if (scopedApp && workspaceId) {
      navigate({
        to: "/apps/$appId/workspaces/$workspaceId/work",
        params: { appId: scopedApp, workspaceId },
      });
      return;
    }
    if (scopedApp) {
      navigate({
        to: "/apps/$appId/work",
        params: { appId: scopedApp },
      });
      return;
    }
    navigate({ to: "/apps" });
  }, [appId, appLayout?.params.appId, navigate, workspaceId]);

  const goThread = useCallback(
    (nextAppId: string, nextWorkspaceId: string, nextThreadId: string) => {
      navigate({
        to: "/apps/$appId/workspaces/$workspaceId/work/$threadId",
        params: {
          appId: nextAppId,
          workspaceId: nextWorkspaceId,
          threadId: nextThreadId,
        },
      });
    },
    [navigate]
  );

  return useMemo(
    () => ({
      appId,
      workspaceId,
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
      workspaceId,
    ]
  );
}
