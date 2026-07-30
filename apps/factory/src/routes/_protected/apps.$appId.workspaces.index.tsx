import { createFileRoute } from "@tanstack/react-router";
import { AppWorkspacesPage } from "@/components/apps/app-workspaces";

export const Route = createFileRoute("/_protected/apps/$appId/workspaces/")({
  ssr: false,
  component: WorkspacesIndex,
});

function WorkspacesIndex() {
  const { appId } = Route.useParams();
  return <AppWorkspacesPage appId={appId} />;
}
