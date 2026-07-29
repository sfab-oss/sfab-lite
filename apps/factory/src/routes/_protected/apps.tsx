import { createFileRoute } from "@tanstack/react-router";
import { AppsListScreen } from "@/screens/apps-list";

export const Route = createFileRoute("/_protected/apps")({
  ssr: false,
  component: AppsListScreen,
});
