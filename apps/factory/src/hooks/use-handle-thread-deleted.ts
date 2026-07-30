import { useCallback } from "react";
import { useAppAgentRegistry } from "@/components/chat/app-agent-bridge";
import { useApps } from "@/hooks/query/use-apps";
import { useConsoleRoute } from "@/hooks/use-console-route";
import { useConsoleSession } from "@/hooks/use-console-session";
import { readyAppsFromList } from "@/lib/api/apps";
import type { Thread } from "@/lib/chat/types";

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

      if (thread.appId && thread.workspaceId) {
        setScope(thread.appId, appName);
        attend(thread.workspaceId, thread.appId, appName);
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
