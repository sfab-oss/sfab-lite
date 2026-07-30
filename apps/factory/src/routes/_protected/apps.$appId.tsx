import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AppTabShell } from "@/components/console/app-tab-shell";

export const Route = createFileRoute("/_protected/apps/$appId")({
  ssr: false,
  component: AppShellLayout,
});

function isWorkPath(pathname: string, appId: string): boolean {
  const base = `/apps/${appId}`;
  return (
    pathname === `${base}/work` ||
    pathname.startsWith(`${base}/work/`) ||
    pathname === `${base}/agent` ||
    pathname.startsWith(`${base}/agent/`) ||
    pathname.startsWith(`${base}/t/`)
  );
}

function AppShellLayout() {
  const { appId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isWorkPath(pathname, appId)) {
    return <Outlet />;
  }
  return (
    <>
      <AppTabShell appId={appId} />
      <Outlet />
    </>
  );
}
