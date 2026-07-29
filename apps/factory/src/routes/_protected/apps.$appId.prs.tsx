import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId/prs")({
  ssr: false,
  component: () => <Outlet />,
});
