import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";

const ChatScreen = lazy(() =>
  import("@/features/chat/page").then((m) => ({ default: m.ChatScreen }))
);

export const Route = createFileRoute("/dev/chat/apps/$appId/t/$threadId")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: DevChatThread,
});

function DevChatThread() {
  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <ChatScreen />
    </Suspense>
  );
}
