import { createFileRoute } from "@tanstack/react-router";
import { AppConsolePreviewScreen } from "@/screens/app-console-preview";

export const Route = createFileRoute("/_protected/apps/$appId/preview")({
  ssr: false,
  component: ProtectedAppPreview,
});

function ProtectedAppPreview() {
  const { appId } = Route.useParams();
  return <AppConsolePreviewScreen appId={appId} />;
}
