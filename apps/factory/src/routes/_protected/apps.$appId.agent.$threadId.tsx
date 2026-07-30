import { createFileRoute } from "@tanstack/react-router";
import { LazyChatScreen } from "@/components/chat/lazy-chat-screen";

export const Route = createFileRoute("/_protected/apps/$appId/agent/$threadId")(
  {
    ssr: false,
    component: LazyChatScreen,
  }
);
