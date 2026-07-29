import { createFileRoute } from "@tanstack/react-router";
import { AppCodeScreen } from "@/screens/app-code";

export const Route = createFileRoute("/_protected/apps/$appId/code")({
  ssr: false,
  component: CodeRoute,
});

function CodeRoute() {
  const { appId } = Route.useParams();
  return <AppCodeScreen appId={appId} />;
}
