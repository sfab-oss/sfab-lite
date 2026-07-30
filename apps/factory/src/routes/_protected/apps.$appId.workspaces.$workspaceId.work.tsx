import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { AgentContentSkeleton } from "@/components/console/agent-content-skeleton";

export const Route = createFileRoute(
  "/_protected/apps/$appId/workspaces/$workspaceId/work"
)({
  ssr: false,
  component: WorkspaceWorkLayout,
});

function WorkspaceWorkLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<AgentContentSkeleton />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
