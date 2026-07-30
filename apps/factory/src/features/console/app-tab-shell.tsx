import { AgentSigil } from "@sfab-lite/ui/components/icons/agent-sigil";
import { Separator } from "@sfab-lite/ui/components/shadcn/separator";
import { cn } from "@sfab-lite/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { AppLayoutSidebarTrigger } from "@/components/brand/app-layout";
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
  const appName = appQuery.data?.name ?? "App";

  return (
    <header className="flex shrink-0 flex-col border-b bg-background">
      <div className="flex h-10 min-w-0 items-center gap-2 px-3">
        <AppLayoutSidebarTrigger className="-ml-1" />
        <Separator className="h-4 md:hidden" orientation="vertical" />
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <AgentSigil className="size-4" grid id={appId} />
        </div>
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {appName}
        </span>
      </div>
      <nav
        aria-label="App sections"
        className="-mb-px flex items-end gap-1 overflow-x-auto px-3"
      >
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              className={cn(
                "relative shrink-0 border-transparent border-b-2 px-2 py-2 text-sm no-underline transition-colors first:pl-0",
                isActive
                  ? "border-foreground font-medium text-foreground"
                  : "text-muted-foreground hover:border-border hover:text-foreground"
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
    </header>
  );
}
