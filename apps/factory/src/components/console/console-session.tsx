import { type ReactNode, useCallback, useState } from "react";
import { AppAgentRegistryProvider } from "@/components/chat/app-agent-bridge";
import { ChatDataProvider } from "@/components/chat/chat-data-context";
import { OrgEventsRouter } from "@/components/org-events/org-events-router";
import { ConsoleSessionProvider } from "@/hooks/use-console-session";
import {
  createRealChatData,
  type RealChatData,
} from "@/lib/chat/create-real-chat-data";

export function ConsoleProviders({ children }: { children: ReactNode }) {
  const [chatData] = useState<RealChatData>(() => createRealChatData());

  const refreshAttendedApp = useCallback(
    (appId: string) => {
      if (chatData.getAppId() === appId) {
        chatData.refreshApp(appId).catch(() => undefined);
      }
    },
    [chatData]
  );

  return (
    <ChatDataProvider value={chatData}>
      <AppAgentRegistryProvider>
        <ConsoleSessionProvider>
          <OrgEventsRouter refreshAttendedApp={refreshAttendedApp} />
          {children}
        </ConsoleSessionProvider>
      </AppAgentRegistryProvider>
    </ChatDataProvider>
  );
}
