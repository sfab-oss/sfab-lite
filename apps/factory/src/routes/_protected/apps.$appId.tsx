import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppTabShell } from "@/features/console/app-tab-shell";

export const Route = createFileRoute("/_protected/apps/$appId")({
  ssr: false,
  component: AppShellLayout,
});

function AppShellLayout() {
  const { appId } = Route.useParams();
  return (
    <>
      <AppTabShell appId={appId} />
      <Outlet />
    </>
  );
}
