import { TooltipProvider } from "@sfab-lite/ui/components/shadcn/tooltip";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";
import { AppLayout, AppLayoutPage } from "@/components/console/app-layout";
import { ConsoleAppsSidebar } from "@/components/console/console-apps-sidebar";
import { useApps, useCreateApp } from "@/hooks/query/use-apps";
import { useConsoleRoute } from "@/hooks/use-console-route";

export { ConsoleProviders } from "@/components/console/console-session";

export function ConsoleShell({ children }: { children?: ReactNode }) {
  return (
    <TooltipProvider>
      <AppLayout sidebar={<ConsoleSidebar />}>
        <AppLayoutPage>{children ?? <Outlet />}</AppLayoutPage>
      </AppLayout>
    </TooltipProvider>
  );
}

function ConsoleSidebar() {
  const navigate = useNavigate();
  const route = useConsoleRoute();
  const appsQuery = useApps();
  const createApp = useCreateApp();

  const apps = useMemo(() => {
    const list = appsQuery.data?.apps ?? [];
    return [...list]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((app) => ({ appId: app.id, appName: app.name }));
  }, [appsQuery.data?.apps]);

  const onNewApp = useCallback(async () => {
    if (createApp.isPending) {
      return;
    }
    try {
      const created = await createApp.mutateAsync(undefined);
      navigate({
        to: "/apps/$appId",
        params: { appId: created.appId },
      });
    } catch {
      // surfaced via createApp.error on apps list if needed
    }
  }, [createApp, navigate]);

  const onSignOut = () => {
    navigate({ to: "/signin", replace: true });
  };

  return (
    <ConsoleAppsSidebar
      activeAppId={route.appDashboardId}
      apps={apps}
      appsActive={route.appsRoute}
      creating={createApp.isPending}
      onNewApp={onNewApp}
      onSignOut={onSignOut}
    />
  );
}
