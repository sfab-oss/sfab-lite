import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { MockThread } from "../lib/mock-threads";
import { ThreadBindingBadge } from "./thread-binding-badge";

/** Counts up while a thread runs, so a live row reads as live at a glance. */
function ElapsedClock({ startedMinutesAgo }: { startedMinutesAgo: number }) {
  const [seconds, setSeconds] = useState(startedMinutesAgo * 60);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (
    <span className="font-mono tabular-nums">
      {minutes}:{String(rest).padStart(2, "0")}
    </span>
  );
}

function statusPrefix(thread: MockThread): string | null {
  if (thread.status === "running") {
    return "Running · ";
  }
  if (thread.status === "needs-you") {
    return "Needs you · ";
  }
  return null;
}

/**
 * Quiet icon-rail row: one neutral chat glyph + optional status dot.
 * No binding colors, no rings — active state is the menu button only.
 */
function ThreadQuietGlyph({ thread }: { thread: MockThread }) {
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

/**
 * Active rows: title + binding badge + headline. Threads: title + badge +
 * relative time. Binding color encodes task / review PR / org user chat.
 *
 * `quiet` = icon-rail: neutral glyph + status dot (no binding colors / rings).
 */
export function ThreadMenuItem({
  thread,
  active,
  dense,
  onSelect,
  quiet = false,
}: {
  active: boolean;
  /** Active list: title + headline. Threads stays single-line. */
  dense?: boolean;
  onSelect: () => void;
  /** Compact icon-rail treatment (no text badges). */
  quiet?: boolean;
  thread: MockThread;
}) {
  const showHeadline = !dense && Boolean(thread.headline);
  const trailing =
    !dense &&
    thread.status === "running" &&
    thread.startedMinutesAgo !== undefined ? (
      <ElapsedClock startedMinutesAgo={thread.startedMinutesAgo} />
    ) : (
      thread.updatedLabel
    );

  let statusHint: string | null = null;
  if (thread.status === "needs-you") {
    statusHint = "(needs you)";
  } else if (thread.status === "running") {
    statusHint = "(running)";
  }

  const tooltip = [
    thread.title,
    thread.headline ? `— ${thread.headline}` : null,
    statusHint,
  ]
    .filter(Boolean)
    .join(" ");

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
        className={cn(showHeadline && "h-auto items-start py-2")}
        isActive={active}
        onClick={onSelect}
        tooltip={
          thread.headline
            ? `${thread.title} — ${thread.headline}`
            : thread.title
        }
      >
        {showHeadline ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-8">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium leading-tight">
                {thread.title}
              </span>
              <ThreadBindingBadge size="sm" thread={thread} />
            </span>
            <span className="truncate text-[10px] text-muted-foreground leading-tight">
              {statusPrefix(thread)}
              {thread.headline}
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 pr-8">
            <span className="truncate">{thread.title}</span>
            <ThreadBindingBadge size="sm" thread={thread} />
          </span>
        )}
      </SidebarMenuButton>
      <SidebarMenuBadge className={cn("text-[10px]", showHeadline && "top-2")}>
        {trailing}
      </SidebarMenuBadge>
    </SidebarMenuItem>
  );
}

/** True when the inset sidebar is in icon-rail (not mobile sheet). */
export function useIconCollapsed() {
  const { state, isMobile } = useSidebar();
  return state === "collapsed" && !isMobile;
}
