import { createContext, type ReactNode, useContext } from "react";
import type { ChatData } from "./chat-data";

const ChatDataContext = createContext<ChatData | null>(null);

export function ChatDataProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ChatData;
}) {
  return (
    <ChatDataContext.Provider value={value}>
      {children}
    </ChatDataContext.Provider>
  );
}

export function useChatData(): ChatData {
  const value = useContext(ChatDataContext);
  if (!value) {
    throw new Error("useChatData requires ChatDataProvider");
  }
  return value;
}
