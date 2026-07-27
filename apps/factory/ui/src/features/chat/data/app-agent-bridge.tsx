import { useAgent } from "agents/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { Thread } from "../model/types";
import { useChatData } from "./chat-data-context";
import type { RealChatData } from "./create-real-chat-data";

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
  getHandle: (appId: string) => AppAgentHandle | null;
  waitForHandle: (appId: string) => Promise<AppAgentHandle>;
}

const AppAgentRegistryContext = createContext<AppAgentRegistryValue | null>(
  null
);

function toThread(
  summary: ThreadSummary,
  appId: string,
  appName: string | null
): Thread {
  return {
    id: summary.id,
    title: summary.title,
    appId,
    appName,
    readOnly: false,
    status: "idle",
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

function AppAgentBridge({
  appId,
  appName,
  onHandle,
}: {
  appId: string;
  appName: string | null;
  onHandle: (appId: string, handle: AppAgentHandle | null) => void;
}) {
  const chatData = useChatData() as RealChatData;
  const appNameRef = useRef(appName);
  appNameRef.current = appName;

  const agent = useAgent({
    agent: "AppAgent",
    name: appId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        if (parsed.type === "workspace-change") {
          chatData.refreshApp(appId).catch((error: unknown) => {
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
    onHandle(appId, handle);
    return () => onHandle(appId, null);
  }, [agent, appId, onHandle]);

  useEffect(() => {
    let cancelled = false;
    agent.ready
      .then(() => agent.call("listThreads", []) as Promise<ThreadSummary[]>)
      .then((list) => {
        if (cancelled || !Array.isArray(list)) {
          return;
        }
        chatData.mergeThreads(
          list.map((row) => toThread(row, appId, appNameRef.current))
        );
      })
      .catch((error: unknown) => {
        console.error("[chat] listThreads failed", appId, error);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, appId, chatData]);

  return null;
}

/**
 * Holds at most one live AppAgent WebSocket — the app under attention
 * (active thread or scoped blank composer). listApps stays on D1; threads
 * for other apps load when that app becomes attended, not via N forever
 * connections that wake every AppAgent on console open.
 */
export function AppAgentRegistryProvider({
  attendedAppId,
  attendedAppName,
  children,
}: {
  attendedAppId: string | null;
  attendedAppName: string | null;
  children: ReactNode;
}) {
  const handlesRef = useRef(new Map<string, AppAgentHandle>());
  const waitersRef = useRef(
    new Map<string, Array<(handle: AppAgentHandle) => void>>()
  );

  const onHandle = useCallback(
    (appId: string, handle: AppAgentHandle | null) => {
      if (handle) {
        handlesRef.current.set(appId, handle);
        const waiters = waitersRef.current.get(appId);
        if (waiters) {
          waitersRef.current.delete(appId);
          for (const resolve of waiters) {
            resolve(handle);
          }
        }
        return;
      }
      handlesRef.current.delete(appId);
    },
    []
  );

  const waitForHandle = useCallback((appId: string) => {
    const existing = handlesRef.current.get(appId);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<AppAgentHandle>((resolve) => {
      const list = waitersRef.current.get(appId) ?? [];
      list.push(resolve);
      waitersRef.current.set(appId, list);
    });
  }, []);

  const getHandle = useCallback(
    (appId: string) => handlesRef.current.get(appId) ?? null,
    []
  );

  const value = useMemo<AppAgentRegistryValue>(
    () => ({ getHandle, waitForHandle }),
    [getHandle, waitForHandle]
  );

  return (
    <AppAgentRegistryContext.Provider value={value}>
      {attendedAppId ? (
        <AppAgentBridge
          appId={attendedAppId}
          appName={attendedAppName}
          key={attendedAppId}
          onHandle={onHandle}
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
