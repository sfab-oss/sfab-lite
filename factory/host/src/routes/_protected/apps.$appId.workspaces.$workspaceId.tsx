import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { fetchWorkspace } from "@/lib/api/workspaces";

export const Route = createFileRoute(
  "/_protected/apps/$appId/workspaces/$workspaceId"
)({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const workspace = await fetchWorkspace(params.appId, params.workspaceId);
    if (!workspace || workspace.appId !== params.appId) {
      throw notFound();
    }
  },
  component: () => <Outlet />,
});
