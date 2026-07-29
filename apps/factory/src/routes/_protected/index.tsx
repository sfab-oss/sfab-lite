import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";

const ChatScreen = lazy(() =>
  import("@/features/chat/page").then((m) => ({ default: m.ChatScreen }))
);

export const Route = createFileRoute("/_protected/")({
  ssr: false,
  component: ProtectedChatHome,
});

function ProtectedChatHome() {
  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <ChatScreen />
    </Suspense>
  );
}
