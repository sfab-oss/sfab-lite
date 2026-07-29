import { createFileRoute } from "@tanstack/react-router";
import { AppComingSoonScreen } from "@/screens/app-coming-soon";

export const Route = createFileRoute("/_protected/apps/$appId/actions")({
  ssr: false,
  component: () => <AppComingSoonScreen title="Actions" />,
});
