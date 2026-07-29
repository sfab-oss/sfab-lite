import { useCallback } from "react";
import { readyAppsFromList, useApps } from "@/hooks/use-apps";
import { useConsoleSession } from "./console-session";
import { useAppAgentRegistry } from "./data/app-agent-bridge";
import type { Thread } from "./model/types";
import { useConsoleRoute } from "./use-console-route";

/**
 * Single delete policy for sidebar + thread header.
 * Always clears the seed; navigates away when the deleted thread is the one
 * in view (or when already on chat home with no active thread).
 */
export function useHandleThreadDeleted(activeThreadId: string | null) {
  const { clearThreadSeed, setScope, clearScope } = useConsoleSession();
  const { attend, clearAttention } = useAppAgentRegistry();
  const { threadId: routeThreadId, goChatHome } = useConsoleRoute();
  const appsQuery = useApps();

  return useCallback(
    (thread: Thread) => {
      clearThreadSeed(thread.id);

      const viewingDeleted =
        routeThreadId === thread.id ||
        activeThreadId === thread.id ||
        (activeThreadId == null && routeThreadId == null);

      if (!viewingDeleted) {
        return;
      }

      const readyApps = readyAppsFromList(appsQuery.data?.apps);
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

      clearScope();
      clearAttention();
      goChatHome();
    },
    [
      activeThreadId,
      appsQuery.data?.apps,
      attend,
      clearAttention,
      clearScope,
      clearThreadSeed,
      goChatHome,
      routeThreadId,
      setScope,
    ]
  );
}
