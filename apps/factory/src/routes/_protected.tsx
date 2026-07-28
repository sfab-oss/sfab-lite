import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AuthRequiredError, listApps } from "@/api";
import { authClient, endUnusableSession } from "@/auth-client";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";
import { SessionBoot } from "@/components/brand/session-boot";
import { queryClient } from "@/lib/query-client";

const ChatScreen = lazy(() =>
  import("@/features/chat/page").then((m) => ({ default: m.ChatScreen }))
);

export const Route = createFileRoute("/_protected")({
  ssr: false,
  pendingComponent: SessionBoot,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data?.user) {
      throw redirect({ to: "/signin", replace: true });
    }
    try {
      await queryClient.ensureQueryData({
        queryKey: ["apps"],
        queryFn: listApps,
      });
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        await endUnusableSession();
        throw redirect({ to: "/signin", replace: true });
      }
      throw error;
    }
  },
  component: ProtectedConsole,
});

function ProtectedConsole() {
  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <ChatScreen />
    </Suspense>
  );
}
