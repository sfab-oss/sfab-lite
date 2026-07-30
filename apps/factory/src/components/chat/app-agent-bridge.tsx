import { useAgent } from "agents/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChatData } from "@/components/chat/chat-data-context";
import type { RealChatData } from "@/lib/chat/create-real-chat-data";
import type { Thread } from "@/lib/chat/types";

interface ThreadSummary {
  createdAt: number;
  id: string;
  title: string;
  updatedAt: number;
}

export interface AppAgentHandle {
  call: (method: string, args?: unknown[]) => Promise<unknown>;
  ready: Promise<void>;
}

interface AppAgentRegistryValue {
  attend: (workspaceId: string, appId: string, appName: string | null) => void;
  clearAttention: () => void;
  waitForHandle: (workspaceId: string) => Promise<AppAgentHandle>;
}

const AppAgentRegistryContext = createContext<AppAgentRegistryValue | null>(
  null
);

function toThread(
  summary: ThreadSummary,
  workspaceId: string,
  appId: string,
  appName: string | null
): Thread {
  return {
    id: summary.id,
    title: summary.title,
    appId,
    workspaceId,
    appName,
    readOnly: false,
    status: "idle",
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

function AppAgentBridge({
  workspaceId,
  appId,
  appName,
  onHandle,
}: {
  workspaceId: string;
  appId: string;
  appName: string | null;
  onHandle: (workspaceId: string, handle: AppAgentHandle | null) => void;
}) {
  const chatData = useChatData() as RealChatData;
  const appNameRef = useRef(appName);
  appNameRef.current = appName;
  const appIdRef = useRef(appId);
  appIdRef.current = appId;

  const agent = useAgent({
    agent: "AppAgent",
    name: workspaceId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "workspace-change") {
          chatData.refreshApp(appIdRef.current).catch((error: unknown) => {
            console.error("[chat] workspace-change refresh failed", error);
          });
        }
      } catch {
        // Non-JSON frame — not a workspace-change signal.
      }
    },
  });

  useEffect(() => {
    const handle: AppAgentHandle = {
      call: (method, args) => agent.call(method, args ?? []),
      ready: agent.ready,
    };
    onHandle(workspaceId, handle);
    return () => onHandle(workspaceId, null);
  }, [agent, onHandle, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    agent.ready
      .then(() => agent.call("listThreads", []) as Promise<ThreadSummary[]>)
      .then((list) => {
        if (cancelled || !Array.isArray(list)) {
          return;
        }
        chatData.syncWorkspaceThreads(
          workspaceId,
          list.map((row) =>
            toThread(row, workspaceId, appIdRef.current, appNameRef.current)
          )
        );
      })
      .catch((error: unknown) => {
        console.error("[chat] listThreads failed", workspaceId, error);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, chatData, workspaceId]);

  return null;
}

/**
 * Holds at most one live AppAgent WebSocket — the workspace the child declares
 * via attend(). Mount with no props; the child drives attention through context.
 */
export function AppAgentRegistryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [attended, setAttended] = useState<{
    workspaceId: string;
    appId: string;
    appName: string | null;
  } | null>(null);
  const handlesRef = useRef(new Map<string, AppAgentHandle>());
  const waitersRef = useRef(
    new Map<string, Array<(handle: AppAgentHandle) => void>>()
  );

  const onHandle = useCallback(
    (workspaceId: string, handle: AppAgentHandle | null) => {
      if (handle) {
        handlesRef.current.set(workspaceId, handle);
        const waiters = waitersRef.current.get(workspaceId);
        if (waiters) {
          waitersRef.current.delete(workspaceId);
          for (const resolve of waiters) {
            resolve(handle);
          }
        }
        return;
      }
      handlesRef.current.delete(workspaceId);
    },
    []
  );

  const attend = useCallback(
    (workspaceId: string, appId: string, appName: string | null) => {
      setAttended((current) => {
        if (
          current?.workspaceId === workspaceId &&
          current.appId === appId &&
          current.appName === appName
        ) {
          return current;
        }
        return { workspaceId, appId, appName };
      });
    },
    []
  );

  const clearAttention = useCallback(() => {
    setAttended(null);
  }, []);

  const waitForHandle = useCallback((workspaceId: string) => {
    const existing = handlesRef.current.get(workspaceId);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<AppAgentHandle>((resolve) => {
      const list = waitersRef.current.get(workspaceId) ?? [];
      list.push(resolve);
      waitersRef.current.set(workspaceId, list);
    });
  }, []);

  const value = useMemo<AppAgentRegistryValue>(
    () => ({ attend, clearAttention, waitForHandle }),
    [attend, clearAttention, waitForHandle]
  );

  return (
    <AppAgentRegistryContext.Provider value={value}>
      {attended ? (
        <AppAgentBridge
          appId={attended.appId}
          appName={attended.appName}
          key={attended.workspaceId}
          onHandle={onHandle}
          workspaceId={attended.workspaceId}
        />
      ) : null}
      {children}
    </AppAgentRegistryContext.Provider>
  );
}

export function useAppAgentRegistry(): AppAgentRegistryValue {
  const value = useContext(AppAgentRegistryContext);
  if (!value) {
    throw new Error("useAppAgentRegistry requires AppAgentRegistryProvider");
  }
  return value;
}

export async function createServerThread(
  handle: AppAgentHandle,
  opts?: { title?: string }
): Promise<ThreadSummary> {
  await handle.ready;
  return (await handle.call(
    "createThread",
    opts ? [opts] : []
  )) as ThreadSummary;
}

export async function renameServerThread(
  handle: AppAgentHandle,
  id: string,
  title: string
): Promise<void> {
  await handle.ready;
  await handle.call("renameThread", [id, title]);
}

export async function deleteServerThread(
  handle: AppAgentHandle,
  id: string
): Promise<void> {
  await handle.ready;
  await handle.call("deleteThread", [id]);
}
