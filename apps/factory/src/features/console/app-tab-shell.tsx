import { cn } from "@sfab-lite/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AppLayoutHeader,
  AppLayoutSubheader,
} from "@/components/brand/app-layout";
import { useApp } from "@/hooks/use-apps";

const TABS = [
  { id: "overview", label: "Overview", to: "/apps/$appId" as const },
  { id: "code", label: "Code", to: "/apps/$appId/code" as const },
  {
    id: "deployments",
    label: "Deployments",
    to: "/apps/$appId/deployments" as const,
  },
  { id: "prs", label: "Pull requests", to: "/apps/$appId/prs" as const },
  { id: "actions", label: "Actions", to: "/apps/$appId/actions" as const },
  { id: "agent", label: "Agent", to: "/apps/$appId/agent" as const },
] as const;

type TabId = (typeof TABS)[number]["id"];

function activeTabFromPath(pathname: string, appId: string): TabId | null {
  const base = `/apps/${appId}`;
  if (pathname === base || pathname === `${base}/`) {
    return "overview";
  }
  if (pathname.startsWith(`${base}/code`)) {
    return "code";
  }
  if (pathname.startsWith(`${base}/deployments`)) {
    return "deployments";
  }
  if (pathname.startsWith(`${base}/prs`)) {
    return "prs";
  }
  if (pathname.startsWith(`${base}/actions`)) {
    return "actions";
  }
  if (
    pathname.startsWith(`${base}/agent`) ||
    pathname.startsWith(`${base}/t/`)
  ) {
    return "agent";
  }
  return null;
}

export function AppTabShell({ appId }: { appId: string }) {
  const appQuery = useApp(appId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = activeTabFromPath(pathname, appId);

  return (
    <>
      <AppLayoutHeader className="px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="shrink-0 text-muted-foreground text-sm no-underline hover:underline"
            to="/apps"
          >
            Apps
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="truncate font-medium text-sm">
            {appQuery.data?.name ?? "App"}
          </span>
        </div>
      </AppLayoutHeader>
      <AppLayoutSubheader className="px-3">
        <nav
          aria-label="App sections"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <Link
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-sm no-underline transition-colors",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={tab.id}
                params={{ appId }}
                to={tab.to}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </AppLayoutSubheader>
    </>
  );
}
