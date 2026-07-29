import { LogoDots } from "@sfab-lite/ui/components/icons/logo-dots";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sfab-lite/ui/components/shadcn/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { AppWindow, ChevronRight, Home, Plus } from "lucide-react";
import { useMemo } from "react";
import { groupThreadsByApp, searchThreads } from "../model/thread-list";
import type { Thread } from "../model/types";
import { ThreadMenuItem } from "./thread-menu-item";
import { ThreadSearch } from "./thread-search";
import { ThreadsSidebarFooter } from "./threads-sidebar-footer";

export interface SessionThreadsSidebarProps {
  activeAppId?: string | null;
  activeThreadId: string | null;
  appsActive?: boolean;
  homeActive?: boolean;
  knownApps?: Array<{ appId: string; appName: string }>;
  onGoHome: () => void;
  onNewThread: () => void;
  onSearchChange: (search: string) => void;
  onSelectThread: (threadId: string) => void;
  onSignOut?: () => void;
  onThreadDeleted?: (thread: Thread) => void;
  railClassName?: string;
  search: string;
  showCollapseTrigger?: boolean;
  showRail?: boolean;
  threads: Thread[];
}

export function SessionThreadsSidebar({
  threads,
  knownApps = [],
  activeAppId = null,
  activeThreadId,
  search,
  onSearchChange,
  onSelectThread,
  onGoHome,
  onNewThread,
  onSignOut,
  onThreadDeleted,
  homeActive = false,
  appsActive = false,
  showRail = true,
  railClassName = "inset-y-2",
  showCollapseTrigger = true,
}: SessionThreadsSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();

  const visible = useMemo(
    () => searchThreads(threads, search),
    [threads, search]
  );

  const appGroups = useMemo(
    () => groupThreadsByApp(visible, knownApps),
    [knownApps, visible]
  );

  const selectThread = (threadId: string) => {
    onSelectThread(threadId);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const openApp = (appId: string) => {
    navigate({ to: "/apps/$appId", params: { appId } });
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const goHome = () => {
    onGoHome();
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
                isActive={homeActive}
                onClick={goHome}
                tooltip="Home"
                type="button"
              >
                <Home className="size-4" />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
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

        <SidebarSeparator />

        <SidebarGroup>
          <div className="flex items-center gap-1 pr-1 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="flex-1">Apps</SidebarGroupLabel>
            <ThreadSearch onSearchChange={onSearchChange} search={search} />
            <Button
              aria-label="New thread"
              className="size-6 shrink-0 text-muted-foreground"
              onClick={onNewThread}
              size="icon-xs"
              title="New thread"
              type="button"
              variant="ghost"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>

          {appGroups.length === 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              {search.trim() ? "No apps match this search." : "No apps yet."}
            </p>
          ) : (
            <SidebarMenu>
              {appGroups.map((group) => (
                <AppBucket
                  active={activeAppId === group.appId}
                  activeThreadId={activeThreadId}
                  key={group.appId}
                  label={group.appName}
                  onOpenApp={() => openApp(group.appId)}
                  onSelectThread={selectThread}
                  onThreadDeleted={onThreadDeleted}
                  threads={group.threads}
                />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
      <ThreadsSidebarFooter onSignOut={onSignOut} />
      {showRail ? <SidebarRail className={railClassName} /> : null}
    </Sidebar>
  );
}

function AppBucket({
  active,
  label,
  threads,
  activeThreadId,
  onOpenApp,
  onSelectThread,
  onThreadDeleted,
}: {
  active: boolean;
  activeThreadId: string | null;
  label: string;
  onOpenApp: () => void;
  onSelectThread: (threadId: string) => void;
  onThreadDeleted?: (thread: Thread) => void;
  threads: Thread[];
}) {
  const hasThreads = threads.length > 0;
  const defaultOpen =
    active || threads.some((thread) => thread.id === activeThreadId);

  if (!hasThreads) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          onClick={onOpenApp}
          tooltip={label}
          type="button"
        >
          <AppWindow className="size-4" />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      className="group/collapsible"
      defaultOpen={defaultOpen}
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        isActive={active}
        onClick={onOpenApp}
        tooltip={label}
        type="button"
      >
        <AppWindow className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={
          <SidebarMenuAction
            aria-label={`Toggle threads for ${label}`}
            className="data-[panel-open]:rotate-90"
          />
        }
      >
        <ChevronRight />
        <span className="sr-only">Toggle</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {threads.map((thread) => (
            <ThreadMenuItem
              active={activeThreadId === thread.id}
              key={thread.id}
              nested
              onDeleted={onThreadDeleted}
              onSelect={() => onSelectThread(thread.id)}
              thread={thread}
            />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
