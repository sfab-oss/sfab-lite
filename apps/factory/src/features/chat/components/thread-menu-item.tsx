import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { cn } from "@sfab-lite/ui/lib/utils";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useThreadLifecycle } from "../hooks/use-thread-lifecycle";
import { formatRelativeTime } from "../model/thread-list";
import type { Thread } from "../model/types";
import {
  DeleteThreadDialog,
  RenameThreadDialog,
} from "./thread-lifecycle-dialogs";

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

export function ThreadMenuItem({
  thread,
  active,
  dense,
  nested = false,
  onSelect,
  onDeleted,
}: {
  active: boolean;
  dense?: boolean;
  nested?: boolean;
  onDeleted?: (thread: Thread) => void;
  onSelect: () => void;
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

  const { busy, error, renameThread, deleteThread, clearError } =
    useThreadLifecycle();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const showActions = Boolean(onDeleted);

  const actions = showActions ? (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              aria-label={`Actions for ${thread.title}`}
              showOnHover={!nested}
            />
          }
        >
          <MoreHorizontal />
          <span className="sr-only">Thread actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem
            disabled={busy}
            onClick={() => {
              clearError();
              setRenameOpen(true);
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy}
            onClick={() => {
              clearError();
              setDeleteOpen(true);
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameThreadDialog
        busy={busy}
        error={renameOpen ? error : null}
        onOpenChange={setRenameOpen}
        onRename={(title) => renameThread(thread, title)}
        open={renameOpen}
        thread={thread}
      />
      <DeleteThreadDialog
        busy={busy}
        error={deleteOpen ? error : null}
        onConfirm={async () => {
          const ok = await deleteThread(thread);
          if (ok) {
            onDeleted?.(thread);
          }
          return ok;
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        thread={thread}
      />
    </>
  ) : null;

  if (nested) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          className={cn(showStatus && "h-auto items-start py-1.5")}
          isActive={active}
          onClick={onSelect}
          render={<button type="button" />}
        >
          {showStatus ? (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
              <span className="truncate font-medium text-xs leading-tight">
                {thread.title}
              </span>
              <span className="truncate text-[10px] text-muted-foreground leading-tight">
                {statusLabel}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate pr-6 text-xs">
              {thread.title}
            </span>
          )}
        </SidebarMenuSubButton>
        {actions}
      </SidebarMenuSubItem>
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
            <span className="truncate font-medium text-xs leading-tight">
              {thread.title}
            </span>
            <span className="truncate text-[10px] text-muted-foreground leading-tight">
              {statusLabel}
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate pr-8 text-xs">
            {thread.title}
          </span>
        )}
      </SidebarMenuButton>
      <SidebarMenuBadge
        className={cn(
          "text-[10px]",
          showStatus && "top-2",
          showActions &&
            "group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0"
        )}
      >
        {trailing}
      </SidebarMenuBadge>
      {actions}
    </SidebarMenuItem>
  );
}
