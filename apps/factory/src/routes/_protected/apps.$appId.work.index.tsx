import { createFileRoute, redirect } from "@tanstack/react-router";
import { fetchDefaultWorkspace } from "@/lib/api/workspaces";

export const Route = createFileRoute("/_protected/apps/$appId/work/")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const workspace = await fetchDefaultWorkspace(params.appId);
    throw redirect({
      to: "/apps/$appId/workspaces/$workspaceId/work",
      params: {
        appId: params.appId,
        workspaceId: workspace.id,
      },
      replace: true,
    });
  },
  component: () => null,
});
