import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "../model/thread-list";
import type { Thread } from "../model/types";
import { ThreadBindingBadge } from "./thread-binding-badge";

function ElapsedClock({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (
    <span className="font-mono tabular-nums">
      {minutes}:{String(rest).padStart(2, "0")}
    </span>
  );
}

function statusPrefix(thread: Thread): string | null {
  if (thread.status === "running") {
    return "Running";
  }
  if (thread.status === "needs-you") {
    return "Needs you";
  }
  return null;
}

function ThreadQuietGlyph({ thread }: { thread: Thread }) {
  const live = thread.status === "running" || thread.status === "needs-you";

  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <MessageSquare aria-hidden className="size-4 text-sidebar-foreground" />
      {live ? (
        <span
          aria-hidden
          className={cn(
            "absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
            thread.status === "needs-you"
              ? "bg-foreground"
              : "animate-pulse bg-foreground/70"
          )}
        />
      ) : null}
    </span>
  );
}

export function ThreadMenuItem({
  thread,
  active,
  dense,
  onSelect,
  quiet = false,
}: {
  active: boolean;
  dense?: boolean;
  onSelect: () => void;
  quiet?: boolean;
  thread: Thread;
}) {
  const statusLabel = statusPrefix(thread);
  const showStatus = !dense && Boolean(statusLabel);
  const trailing =
    !dense && thread.status === "running" ? (
      <ElapsedClock since={thread.updatedAt} />
    ) : (
      formatRelativeTime(thread.updatedAt)
    );

  let statusHint: string | null = null;
  if (thread.status === "needs-you") {
    statusHint = "(needs you)";
  } else if (thread.status === "running") {
    statusHint = "(running)";
  }

  const tooltip = [thread.title, statusHint].filter(Boolean).join(" ");

  if (quiet) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          onClick={onSelect}
          tooltip={tooltip}
        >
          <ThreadQuietGlyph thread={thread} />
          <span className="sr-only">{thread.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(showStatus && "h-auto items-start py-2")}
        isActive={active}
        onClick={onSelect}
        tooltip={thread.title}
      >
        {showStatus ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium leading-tight">
                {thread.title}
              </span>
              <ThreadBindingBadge size="sm" thread={thread} />
            </span>
            <span className="truncate text-[10px] text-muted-foreground leading-tight">
              {statusLabel}
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 pr-8">
            <span className="truncate">{thread.title}</span>
            <ThreadBindingBadge size="sm" thread={thread} />
          </span>
        )}
      </SidebarMenuButton>
      <SidebarMenuBadge className={cn("text-[10px]", showStatus && "top-2")}>
        {trailing}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}

export function useIconCollapsed() {
  const { state, isMobile } = useSidebar();
  return state === "collapsed" && !isMobile;
}
