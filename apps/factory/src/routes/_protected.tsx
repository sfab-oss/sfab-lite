import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { authClient } from "@/auth/client";
import {
  ConsoleProviders,
  ConsoleShell,
} from "@/components/console/chat-shell";
import { ConsoleShellSkeleton } from "@/components/console/console-shell-skeleton";
import { SessionBoot } from "@/components/console/session-boot";
import { fetchApps } from "@/lib/api/apps";
import { AuthRequiredError } from "@/lib/api-errors";
import { endUnusableSession } from "@/lib/auth/session";
import { queryClient } from "@/lib/query-client";

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
        queryFn: fetchApps,
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
      <ConsoleProviders>
        <ConsoleShell>
          <Outlet />
        </ConsoleShell>
      </ConsoleProviders>
    </Suspense>
  );
}
