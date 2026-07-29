import { TooltipProvider } from "@sfab-lite/ui/components/shadcn/tooltip";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";
import { AppLayout, AppLayoutPage } from "@/components/brand/app-layout";
import { ConsoleAppsSidebar } from "@/features/console/console-apps-sidebar";
import { useApps, useCreateApp } from "@/hooks/use-apps";
import { useConsoleRoute } from "./use-console-route";

export { ConsoleProviders } from "./console-session";

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
      onNewApp={onNewApp}
      onSignOut={onSignOut}
    />
  );
}
