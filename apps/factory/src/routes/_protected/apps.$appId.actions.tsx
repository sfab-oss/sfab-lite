import { createFileRoute } from "@tanstack/react-router";
import { AppActionsPage } from "@/components/apps/app-actions";

export const Route = createFileRoute("/_protected/apps/$appId/actions")({
  ssr: false,
  component: ActionsRoute,
});

function ActionsRoute() {
  const { appId } = Route.useParams();
  return <AppActionsPage appId={appId} />;
}
