import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId/agent")({
  ssr: false,
  component: () => <Outlet />,
});
