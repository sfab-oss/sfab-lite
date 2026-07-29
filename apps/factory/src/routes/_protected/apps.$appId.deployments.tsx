import { createFileRoute } from "@tanstack/react-router";
import { AppDeploymentsScreen } from "@/screens/app-deployments";

export const Route = createFileRoute("/_protected/apps/$appId/deployments")({
  ssr: false,
  component: DeploymentsRoute,
});

function DeploymentsRoute() {
  const { appId } = Route.useParams();
  return <AppDeploymentsScreen appId={appId} />;
}
