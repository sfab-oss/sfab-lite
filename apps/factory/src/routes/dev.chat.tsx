import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";
import { ConsoleProviders, ConsoleShell } from "@/features/chat/console-shell";

export const Route = createFileRoute("/dev/chat")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: DevChatLayout,
});

function DevChatLayout() {
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
