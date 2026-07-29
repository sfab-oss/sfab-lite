import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";

const ChatScreen = lazy(() =>
  import("@/features/chat/page").then((m) => ({ default: m.ChatScreen }))
);

export const Route = createFileRoute("/_protected/apps/$appId/agent/$threadId")(
  {
    ssr: false,
    component: ProtectedAgentThread,
  }
);

function ProtectedAgentThread() {
  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <ChatScreen />
    </Suspense>
  );
}
