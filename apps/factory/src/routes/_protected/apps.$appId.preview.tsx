import { createFileRoute } from "@tanstack/react-router";
import { AppConsolePreviewPage } from "@/components/apps/app-console-preview";

export const Route = createFileRoute("/_protected/apps/$appId/preview")({
  ssr: false,
  component: ProtectedAppPreview,
});

function ProtectedAppPreview() {
  const { appId } = Route.useParams();
  return <AppConsolePreviewPage appId={appId} />;
}
