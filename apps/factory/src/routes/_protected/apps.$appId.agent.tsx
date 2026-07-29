import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { AgentContentSkeleton } from "@/features/console/agent-content-skeleton";

export const Route = createFileRoute("/_protected/apps/$appId/agent")({
  ssr: false,
  component: AgentLayout,
});

function AgentLayout() {
  return (
    <Suspense fallback={<AgentContentSkeleton />}>
      <Outlet />
    </Suspense>
  );
}
