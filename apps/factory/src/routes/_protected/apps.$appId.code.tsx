import { createFileRoute } from "@tanstack/react-router";
import { AppComingSoonScreen } from "@/screens/app-coming-soon";

export const Route = createFileRoute("/_protected/apps/$appId/code")({
  ssr: false,
  component: () => <AppComingSoonScreen title="Code" />,
});
