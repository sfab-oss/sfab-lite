import { createFileRoute } from "@tanstack/react-router";
import { AppActionsScreen } from "@/screens/app-actions";

export const Route = createFileRoute("/_protected/apps/$appId/actions")({
  ssr: false,
  component: ActionsRoute,
});

function ActionsRoute() {
  const { appId } = Route.useParams();
  return <AppActionsScreen appId={appId} />;
}
