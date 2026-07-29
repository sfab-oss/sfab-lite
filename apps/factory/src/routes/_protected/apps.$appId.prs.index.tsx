import { createFileRoute } from "@tanstack/react-router";
import { AppPrsScreen } from "@/screens/app-prs";

export const Route = createFileRoute("/_protected/apps/$appId/prs/")({
  ssr: false,
  component: ProtectedAppPrs,
});

function ProtectedAppPrs() {
  const { appId } = Route.useParams();
  return <AppPrsScreen appId={appId} />;
}
