import { AgentSigil } from "@sfab-lite/ui/components/icons/agent-sigil";
import { LogoDots } from "@sfab-lite/ui/components/icons/logo-dots";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { AppWindow, Plus } from "lucide-react";
import { ConsoleAppsSidebarFooter } from "./console-apps-sidebar-footer";

export interface ConsoleAppsSidebarProps {
  activeAppId?: string | null;
  apps: Array<{ appId: string; appName: string }>;
  appsActive?: boolean;
  onNewApp: () => void;
  onSignOut?: () => void;
  railClassName?: string;
  showCollapseTrigger?: boolean;
  showRail?: boolean;
}

export function ConsoleAppsSidebar({
  apps,
  activeAppId = null,
  onNewApp,
  onSignOut,
  appsActive = false,
  showRail = true,
  railClassName = "inset-y-2",
  showCollapseTrigger = true,
}: ConsoleAppsSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();

  const openApp = (appId: string) => {
    navigate({ to: "/apps/$appId", params: { appId } });
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const goApps = () => {
    navigate({ to: "/apps" });
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const createApp = () => {
    onNewApp();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="flex h-10 shrink-0 flex-row items-center border-sidebar-border border-b p-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <div className="flex size-7 shrink-0 items-center justify-center">
            <LogoDots
              accent="var(--brand)"
              className="size-6"
              style={{ color: "var(--sidebar-foreground)" }}
            />
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate font-semibold text-sm">
              sfab-lite
            </span>
          </div>
          {showCollapseTrigger ? (
            <SidebarTrigger className="hidden size-7 shrink-0 group-data-[collapsible=icon]:hidden md:flex" />
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-x-hidden">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={appsActive && !activeAppId}
                onClick={goApps}
                tooltip="All apps"
                type="button"
              >
                <AppWindow className="size-4" />
                <span>All apps</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Apps</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="New app"
            onClick={createApp}
            title="New app"
          >
            <Plus />
            <span className="sr-only">New app</span>
          </SidebarGroupAction>

          {apps.length === 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              No apps yet.
            </p>
          ) : (
            <SidebarMenu>
              {apps.map((app) => (
                <SidebarMenuItem key={app.appId}>
                  <SidebarMenuButton
                    isActive={activeAppId === app.appId}
                    onClick={() => openApp(app.appId)}
                    tooltip={app.appName}
                    type="button"
                  >
                    <AgentSigil className="size-4" id={app.appId} />
                    <span>{app.appName}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
      <ConsoleAppsSidebarFooter onSignOut={onSignOut} />
      {showRail ? <SidebarRail className={railClassName} /> : null}
    </Sidebar>
  );
}
