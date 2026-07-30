import { createFileRoute } from "@tanstack/react-router";
import { AppDeploymentsPage } from "@/components/apps/app-deployments";

export const Route = createFileRoute("/_protected/apps/$appId/deployments")({
  ssr: false,
  component: DeploymentsRoute,
});

function DeploymentsRoute() {
  const { appId } = Route.useParams();
  return <AppDeploymentsPage appId={appId} />;
}
