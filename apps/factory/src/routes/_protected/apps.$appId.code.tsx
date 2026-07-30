import { createFileRoute } from "@tanstack/react-router";
import { AppCodePage } from "@/components/apps/app-code";

export const Route = createFileRoute("/_protected/apps/$appId/code")({
  ssr: false,
  component: CodeRoute,
});

function CodeRoute() {
  const { appId } = Route.useParams();
  return <AppCodePage appId={appId} />;
}
