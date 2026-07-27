import { useCallback, useState } from "react";
import {
  deleteServerThread,
  renameServerThread,
  useAppAgentRegistry,
} from "../data/app-agent-bridge";
import { useChatData } from "../data/chat-data-context";
import type { Thread } from "../model/types";

export function useThreadLifecycle() {
  const chatData = useChatData();
  const { waitForHandle } = useAppAgentRegistry();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renameThread = useCallback(
    async (thread: Thread, title: string): Promise<boolean> => {
      const trimmed = title.trim();
      if (!trimmed || trimmed === thread.title) {
        return false;
      }
      if (!thread.appId) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const handle = await waitForHandle(thread.appId);
        await renameServerThread(handle, thread.id, trimmed);
        chatData.patchThread(thread.id, {
          title: trimmed,
          updatedAt: Date.now(),
        });
        return true;
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [chatData, waitForHandle]
  );

  const deleteThread = useCallback(
    async (
      thread: Thread,
      opts?: { disconnect?: () => void }
    ): Promise<boolean> => {
      if (!thread.appId) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        // An open AppThread WebSocket keeps the facet in the parent registry.
        // Leave that view first so deleteSubAgent can clear it; otherwise
        // listThreads resurrects a meta-less row with a default title.
        opts?.disconnect?.();
        if (opts?.disconnect) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 120);
          });
        }
        const handle = await waitForHandle(thread.appId);
        await deleteServerThread(handle, thread.id);
        chatData.removeThread(thread.id);
        return true;
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : String(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [chatData, waitForHandle]
  );

  return { busy, error, renameThread, deleteThread, setError };
}
