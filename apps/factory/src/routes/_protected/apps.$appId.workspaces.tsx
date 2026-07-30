import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId/workspaces")({
  ssr: false,
  component: () => <Outlet />,
});
