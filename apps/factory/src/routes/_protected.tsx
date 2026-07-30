import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { authClient, endUnusableSession } from "@/auth-client";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";
import { SessionBoot } from "@/components/brand/session-boot";
import { ConsoleProviders, ConsoleShell } from "@/features/chat/console-shell";
import { fetchApps } from "@/hooks/use-apps";
import { AuthRequiredError } from "@/lib/api-errors";
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
