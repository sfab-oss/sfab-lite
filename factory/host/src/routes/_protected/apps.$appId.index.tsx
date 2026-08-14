import { createFileRoute } from "@tanstack/react-router";
import { AppDetailPage } from "@/components/apps/app-detail";

export const Route = createFileRoute("/_protected/apps/$appId/")({
  ssr: false,
  component: ProtectedAppDetail,
});

function ProtectedAppDetail() {
  const { appId } = Route.useParams();
  return <AppDetailPage appId={appId} />;
}
