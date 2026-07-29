import { createFileRoute } from "@tanstack/react-router";
import { AppDetailScreen } from "@/screens/app-detail";

export const Route = createFileRoute("/_protected/apps/$appId")({
  ssr: false,
  component: ProtectedAppDetail,
});

function ProtectedAppDetail() {
  const { appId } = Route.useParams();
  return <AppDetailScreen appId={appId} />;
}
