import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId")({
  ssr: false,
  component: () => <Outlet />,
});
