import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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

export function ConsoleSessionProvider({ children }: { children: ReactNode }) {
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
    <ConsoleSessionContext.Provider value={session}>
      {children}
    </ConsoleSessionContext.Provider>
  );
}
