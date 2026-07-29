import { createFileRoute } from "@tanstack/react-router";
import { AppPrDetailScreen } from "@/screens/app-pr-detail";

export const Route = createFileRoute("/_protected/apps/$appId/prs/$prNumber")({
  ssr: false,
  component: ProtectedAppPrDetail,
});

function ProtectedAppPrDetail() {
  const { appId, prNumber } = Route.useParams();
  return <AppPrDetailScreen appId={appId} prNumber={Number(prNumber)} />;
}
