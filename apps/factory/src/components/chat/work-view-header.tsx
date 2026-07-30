import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import { Separator } from "@sfab-lite/ui/components/shadcn/separator";
import { Link } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import {
  ArrowLeft,
  History,
  ListTree,
  MessageSquare,
  MessageSquareOff,
  PanelRight,
  Plus,
} from "lucide-react";
import { WorkBranchSelector } from "@/components/chat/work-branch-selector";
import { AppLayoutSidebarTrigger } from "@/components/console/app-layout";
import { useApp } from "@/hooks/query/use-apps";
import { formatRelativeTime } from "@/lib/chat/thread-list";
import type { Thread } from "@/lib/chat/types";
import { useWorkspaceTabsStore } from "@/lib/chat/workspace-tabs-store";
import { ThreadHeaderMenu } from "./thread-header-menu";

function ThreadHistoryPicker({
  activeThread,
  appThreads,
  onNewThread,
  onSelectThread,
}: {
  activeThread: Thread | null;
  appThreads: Thread[];
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Thread history"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <History className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onClick={onNewThread}>
          <Plus className="size-4" />
          New thread
        </DropdownMenuItem>
        {appThreads.length > 0 ? <DropdownMenuSeparator /> : null}
        {appThreads.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground text-xs">
            No threads yet
          </div>
        ) : (
          appThreads.map((thread) => (
            <DropdownMenuItem
              className="justify-between gap-3"
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
            >
              <span className="min-w-0 truncate">
                {thread.id === activeThread?.id ? (
                  <span className="font-medium">{thread.title}</span>
                ) : (
                  thread.title
                )}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatRelativeTime(thread.updatedAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkViewHeader({
  appId,
  activeThread,
  appThreads,
  onNewThread,
  onSelectThread,
  onSetSummaryOpen,
  onSetWorkspaceOpen,
  onThreadDeleted,
  readMessages,
  summaryOpen,
  workspaceOpen,
}: {
  appId: string;
  activeThread: Thread | null;
  appThreads: Thread[];
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onSetSummaryOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onSetWorkspaceOpen: (value: boolean | ((open: boolean) => boolean)) => void;
  onThreadDeleted: (thread: Thread) => void;
  readMessages: () => UIMessage[];
  summaryOpen: boolean;
  workspaceOpen: boolean;
}) {
  const appQuery = useApp(appId);
  const appName = appQuery.data?.name ?? "App";
  const chatHidden = useWorkspaceTabsStore((s) => s.chatHidden);
  const setChatHidden = useWorkspaceTabsStore((s) => s.setChatHidden);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-3">
      <AppLayoutSidebarTrigger className="-ml-1" />
      <Separator className="h-4 md:hidden" orientation="vertical" />
      <Button
        aria-label="Back to app"
        className="size-8 shrink-0"
        render={<Link params={{ appId }} to="/apps/$appId" />}
        size="icon"
        variant="ghost"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <span className="min-w-0 truncate font-medium text-sm">{appName}</span>
      <WorkBranchSelector appId={appId} />
      <ThreadHistoryPicker
        activeThread={activeThread}
        appThreads={appThreads}
        onNewThread={onNewThread}
        onSelectThread={onSelectThread}
      />
      {activeThread ? (
        <>
          <span className="min-w-0 truncate text-muted-foreground text-sm">
            {activeThread.title}
          </span>
          <ThreadHeaderMenu
            onDeleted={onThreadDeleted}
            readMessages={readMessages}
            thread={activeThread}
          />
        </>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {activeThread ? (
          <Button
            aria-label={
              summaryOpen ? "Hide summary panel" : "Show summary panel"
            }
            aria-pressed={summaryOpen}
            onClick={() => onSetSummaryOpen((open) => !open)}
            size="icon-sm"
            type="button"
            variant={summaryOpen ? "secondary" : "ghost"}
          >
            <ListTree className="size-4" />
          </Button>
        ) : null}
        <Button
          aria-label={
            workspaceOpen ? "Hide workspace panel" : "Show workspace panel"
          }
          aria-pressed={workspaceOpen}
          onClick={() => onSetWorkspaceOpen((open) => !open)}
          size="icon-sm"
          type="button"
          variant={workspaceOpen ? "secondary" : "ghost"}
        >
          <PanelRight className="size-4" />
        </Button>
        <Button
          aria-label={chatHidden ? "Show chat" : "Hide chat"}
          aria-pressed={chatHidden}
          onClick={() => setChatHidden(!chatHidden)}
          size="icon-sm"
          type="button"
          variant={chatHidden ? "secondary" : "ghost"}
        >
          {chatHidden ? (
            <MessageSquare className="size-4" />
          ) : (
            <MessageSquareOff className="size-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
