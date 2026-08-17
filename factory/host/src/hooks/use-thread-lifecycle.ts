import { useCallback, useState } from "react";
import {
  deleteServerThread,
  renameServerThread,
  useAppAgentRegistry,
} from "@/components/chat/app-agent-bridge";
import { useChatData } from "@/components/chat/chat-data-context";
import type { Thread } from "@/lib/chat/types";

const RPC_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  // AbortSignal.timeout does not cancel the RPC, so the server may have
  // applied it. Say so rather than implying nothing happened.
  const signal = AbortSignal.timeout(RPC_TIMEOUT_MS);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error(`${label} timed out — it may still have gone through.`));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
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
      if (!thread.workspaceId) {
        setError("This conversation is not attached to a workspace yet.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        await withTimeout(
          waitForHandle(thread.workspaceId).then((handle) =>
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
      if (!thread.workspaceId) {
        setError("This conversation is not attached to a workspace yet.");
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        // waitForHandle resolves only once that workspace is attended, and at
        // most one workspace is attended at a time — so it must be inside the
        // timeout or deleting another workspace's thread from the sidebar waits
        // forever.
        await withTimeout(
          waitForHandle(thread.workspaceId).then((handle) =>
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
