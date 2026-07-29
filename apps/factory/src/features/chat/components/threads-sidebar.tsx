import { useNavigate } from "@tanstack/react-router";
import { AppWindow, Home, Plus } from "lucide-react";
import { useMemo } from "react";
import { LogoDots } from "@/components/icons/logo-dots";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { groupThreadsByApp, searchThreads } from "../model/thread-list";
import type { Thread } from "../model/types";
import { ThreadMenuItem, useIconCollapsed } from "./thread-menu-item";
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
  const quietRows = useIconCollapsed();

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
          ) : null}

          {appGroups.map((group) => (
            <AppBucket
              active={activeAppId === group.appId}
              activeThreadId={activeThreadId}
              key={group.appId}
              label={group.appName}
              onOpenApp={() => openApp(group.appId)}
              onSelectThread={selectThread}
              onThreadDeleted={onThreadDeleted}
              quiet={quietRows}
              threads={group.threads}
            />
          ))}
        </SidebarGroup>
      </SidebarContent>
      <ThreadsSidebarFooter onSignOut={onSignOut} />
      {showRail ? <SidebarRail className={railClassName} /> : null}
    </Sidebar>
  );
}

/**
 * An app's name is whatever prompt created it, so this label carries arbitrary
 * user prose rather than a short noun. Upper-casing it turned the longest
 * string in the sidebar into its loudest, sitting directly above thread titles
 * drawn from the same sentence.
 */
const APP_BUCKET_LABEL =
  "block w-full truncate px-2 py-1 text-left font-medium text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden hover:text-foreground";

function AppBucket({
  active,
  label,
  threads,
  activeThreadId,
  onOpenApp,
  onSelectThread,
  onThreadDeleted,
  quiet = false,
}: {
  active: boolean;
  activeThreadId: string | null;
  label: string;
  onOpenApp: () => void;
  onSelectThread: (threadId: string) => void;
  onThreadDeleted?: (thread: Thread) => void;
  quiet?: boolean;
  threads: Thread[];
}) {
  return (
    <div className="mt-1">
      <button
        className={cn(APP_BUCKET_LABEL, active && "text-foreground")}
        onClick={onOpenApp}
        title={label}
        type="button"
      >
        {label}
      </button>
      {threads.length === 0 ? (
        <p className="px-2 pb-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
          No threads yet.
        </p>
      ) : (
        <SidebarMenu>
          {threads.map((thread) => (
            <ThreadMenuItem
              active={activeThreadId === thread.id}
              key={thread.id}
              onDeleted={onThreadDeleted}
              onSelect={() => onSelectThread(thread.id)}
              quiet={quiet}
              thread={thread}
            />
          ))}
        </SidebarMenu>
      )}
    </div>
  );
}
