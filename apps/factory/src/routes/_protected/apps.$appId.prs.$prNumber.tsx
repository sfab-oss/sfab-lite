import { createFileRoute } from "@tanstack/react-router";
import { AppPrDetailPage } from "@/components/apps/app-pr-detail";

export const Route = createFileRoute("/_protected/apps/$appId/prs/$prNumber")({
  ssr: false,
  component: ProtectedAppPrDetail,
});

function ProtectedAppPrDetail() {
  const { appId, prNumber } = Route.useParams();
  return <AppPrDetailPage appId={appId} prNumber={Number(prNumber)} />;
}
