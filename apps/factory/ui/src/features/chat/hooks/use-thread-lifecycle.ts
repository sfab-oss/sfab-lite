import { useCallback, useState } from "react";
import {
  deleteServerThread,
  renameServerThread,
  useAppAgentRegistry,
} from "../data/app-agent-bridge";
import { useChatData } from "../data/chat-data-context";
import type { Thread } from "../model/types";

const RPC_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      // A timeout does not cancel the call, so the server may have applied it.
      // Say so rather than implying nothing happened.
      reject(new Error(`${label} timed out — it may still have gone through.`));
    }, RPC_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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
        setError("This conversation is not attached to an app yet.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        await withTimeout(
          waitForHandle(thread.appId).then((handle) =>
            renameServerThread(handle, thread.id, trimmed)
          ),
          "Rename"
        );
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
    async (thread: Thread): Promise<boolean> => {
      if (!thread.appId) {
        setError("This conversation is not attached to an app yet.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        // waitForHandle resolves only once that app is attended, and at most
        // one app is attended at a time — so it must be inside the timeout or
        // deleting another app's thread from the sidebar waits forever.
        await withTimeout(
          waitForHandle(thread.appId).then((handle) =>
            deleteServerThread(handle, thread.id)
          ),
          "Delete"
        );
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

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, renameThread, deleteThread, clearError };
}
