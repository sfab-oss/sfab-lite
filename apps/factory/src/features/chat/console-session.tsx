import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { OrgEventsRouter } from "@/features/org-events/org-events-router";
import { AppAgentRegistryProvider } from "./data/app-agent-bridge";
import { ChatDataProvider } from "./data/chat-data-context";
import {
  createRealChatData,
  type RealChatData,
} from "./data/create-real-chat-data";

interface ConsoleSessionValue {
  scopeAppId: string | null;
  scopeAppName: string | null;
  setScope: (appId: string | null, appName: string | null) => void;
  clearScope: () => void;
  seedByThread: Record<string, string>;
  setThreadSeed: (threadId: string, text: string) => void;
  consumeThreadSeed: (threadId: string) => void;
  clearThreadSeed: (threadId: string) => void;
}

const ConsoleSessionContext = createContext<ConsoleSessionValue | null>(null);

export function useConsoleSession(): ConsoleSessionValue {
  const value = useContext(ConsoleSessionContext);
  if (!value) {
    throw new Error("useConsoleSession requires ConsoleProviders");
  }
  return value;
}

export function ConsoleProviders({ children }: { children: ReactNode }) {
  const [chatData] = useState<RealChatData>(() => createRealChatData());
  const [scopeAppId, setScopeAppId] = useState<string | null>(null);
  const [scopeAppName, setScopeAppName] = useState<string | null>(null);
  const [seedByThread, setSeedByThread] = useState<Record<string, string>>({});

  const setScope = useCallback(
    (appId: string | null, appName: string | null) => {
      setScopeAppId(appId);
      setScopeAppName(appName);
    },
    []
  );

  const clearScope = useCallback(() => {
    setScopeAppId(null);
    setScopeAppName(null);
  }, []);

  const setThreadSeed = useCallback((threadId: string, text: string) => {
    setSeedByThread((current) => ({ ...current, [threadId]: text }));
  }, []);

  const consumeThreadSeed = useCallback((threadId: string) => {
    setSeedByThread((current) => {
      if (!(threadId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }, []);

  const clearThreadSeed = consumeThreadSeed;

  const session = useMemo(
    () => ({
      scopeAppId,
      scopeAppName,
      setScope,
      clearScope,
      seedByThread,
      setThreadSeed,
      consumeThreadSeed,
      clearThreadSeed,
    }),
    [
      clearScope,
      clearThreadSeed,
      consumeThreadSeed,
      scopeAppId,
      scopeAppName,
      seedByThread,
      setScope,
      setThreadSeed,
    ]
  );

  return (
    <ChatDataProvider value={chatData}>
      <AppAgentRegistryProvider>
        <ConsoleSessionContext.Provider value={session}>
          <OrgEventsRouter />
          {children}
        </ConsoleSessionContext.Provider>
      </AppAgentRegistryProvider>
    </ChatDataProvider>
  );
}
