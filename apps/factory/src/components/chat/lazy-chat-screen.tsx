import { lazy } from "react";

export const LazyChatScreen = lazy(() =>
  import("@/components/chat/chat-screen").then((m) => ({
    default: m.ChatScreen,
  }))
);
