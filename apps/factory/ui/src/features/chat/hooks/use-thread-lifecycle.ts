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
      reject(new Error(`${label} timed out — is the factory still running?`));
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
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const handle = await waitForHandle(thread.appId);
        await withTimeout(
          renameServerThread(handle, thread.id, trimmed),
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
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const handle = await waitForHandle(thread.appId);
        await withTimeout(deleteServerThread(handle, thread.id), "Delete");
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
