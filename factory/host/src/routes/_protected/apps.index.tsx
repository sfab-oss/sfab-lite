import { createFileRoute } from "@tanstack/react-router";
import { AppsListPage } from "@/components/apps/apps-list";

export const Route = createFileRoute("/_protected/apps/")({
  ssr: false,
  component: AppsListPage,
});
