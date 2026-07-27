import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";
import type { ChatData } from "./chat-data";
import type { RealChatData } from "./create-real-chat-data";

const ChatDataContext = createContext<ChatData | null>(null);

function isRealChatData(value: ChatData): value is RealChatData {
  return (
    "subscribe" in value &&
    typeof (value as RealChatData).subscribe === "function" &&
    "getRevision" in value &&
    typeof (value as RealChatData).getRevision === "function"
  );
}

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
  useSyncExternalStore(
    (onStoreChange) =>
      isRealChatData(value) ? value.subscribe(onStoreChange) : () => undefined,
    () => (isRealChatData(value) ? value.getRevision() : 0),
    () => 0
  );
  return value;
}
