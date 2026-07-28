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
import { useRouter } from "@/router";
import {
  groupInactiveByApp,
  isActiveThread,
  searchThreads,
  sortByLiveness,
} from "../model/thread-list";
import type { Thread } from "../model/types";
import { ThreadMenuItem, useIconCollapsed } from "./thread-menu-item";
import { ThreadSearch } from "./thread-search";
import { ThreadsSidebarFooter } from "./threads-sidebar-footer";

export interface SessionThreadsSidebarProps {
  activeThreadId: string | null;
  appsActive?: boolean;
  homeActive?: boolean;
  knownApps?: Array<{ appId: string; appName: string }>;
  onAttendApp?: (appId: string, appName: string) => void;
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
  activeThreadId,
  search,
  onSearchChange,
  onSelectThread,
  onAttendApp,
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
  const { navigate } = useRouter();
  const quietRows = useIconCollapsed();

  const visible = useMemo(
    () => searchThreads(threads, search),
    [threads, search]
  );

  const active = useMemo(
    () => sortByLiveness(visible.filter(isActiveThread)),
    [visible]
  );
  const appGroups = useMemo(
    () => groupInactiveByApp(visible, knownApps),
    [knownApps, visible]
  );
  const inactiveCount = appGroups.reduce(
    (count, group) => count + group.threads.length,
    0
  );
  const showEmptyApps = appGroups.some((group) => group.threads.length === 0);

  const selectThread = (threadId: string) => {
    onSelectThread(threadId);
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const attendApp = (appId: string, appName: string) => {
    onAttendApp?.(appId, appName);
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
    navigate({ name: "apps" });
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
                isActive={appsActive}
                onClick={goApps}
                tooltip="Apps"
                type="button"
              >
                <AppWindow className="size-4" />
                <span>Apps</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {active.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Active</SidebarGroupLabel>
            <SidebarMenu>
              {active.map((thread) => (
                <ThreadMenuItem
                  active={activeThreadId === thread.id}
                  key={thread.id}
                  onDeleted={onThreadDeleted}
                  onSelect={() => selectThread(thread.id)}
                  quiet={quietRows}
                  thread={thread}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {active.length > 0 ? <SidebarSeparator /> : null}

        <SidebarGroup>
          <div className="flex items-center gap-1 pr-1 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="flex-1">Threads</SidebarGroupLabel>
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

          {inactiveCount === 0 && active.length === 0 && !showEmptyApps ? (
            <p className="px-2 py-3 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              No threads match this search.
            </p>
          ) : null}
          {inactiveCount === 0 && active.length > 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
              No other threads.
            </p>
          ) : null}

          {appGroups.map((group) => (
            <AppBucket
              activeThreadId={activeThreadId}
              key={group.appId}
              label={group.appName}
              onAttendApp={
                onAttendApp
                  ? () => attendApp(group.appId, group.appName)
                  : undefined
              }
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
  "block w-full truncate px-2 py-1 font-medium text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden";

function AppBucket({
  label,
  threads,
  activeThreadId,
  onAttendApp,
  onSelectThread,
  onThreadDeleted,
  quiet = false,
}: {
  activeThreadId: string | null;
  label: string;
  onAttendApp?: () => void;
  onSelectThread: (threadId: string) => void;
  onThreadDeleted?: (thread: Thread) => void;
  quiet?: boolean;
  threads: Thread[];
}) {
  return (
    <div className="mt-1">
      {onAttendApp ? (
        <button
          className={cn(APP_BUCKET_LABEL, "text-left hover:text-foreground")}
          onClick={onAttendApp}
          title={label}
          type="button"
        >
          {label}
        </button>
      ) : (
        <p className={APP_BUCKET_LABEL} title={label}>
          {label}
        </p>
      )}
      {threads.length === 0 ? (
        <p className="px-2 pb-2 text-muted-foreground text-xs group-data-[collapsible=icon]:hidden">
          No threads yet.
        </p>
      ) : (
        <SidebarMenu>
          {threads.map((thread) => (
            <ThreadMenuItem
              active={activeThreadId === thread.id}
              dense
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
