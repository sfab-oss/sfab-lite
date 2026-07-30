import { createFileRoute } from "@tanstack/react-router";
import { LazyChatScreen } from "@/components/chat/lazy-chat-screen";

export const Route = createFileRoute("/_protected/apps/$appId/work/")({
  ssr: false,
  component: LazyChatScreen,
});
