import { createFileRoute } from "@tanstack/react-router";
import { AppPrsPage } from "@/components/apps/app-prs";

export const Route = createFileRoute("/_protected/apps/$appId/prs/")({
  ssr: false,
  component: ProtectedAppPrs,
});

function ProtectedAppPrs() {
  const { appId } = Route.useParams();
  return <AppPrsPage appId={appId} />;
}
