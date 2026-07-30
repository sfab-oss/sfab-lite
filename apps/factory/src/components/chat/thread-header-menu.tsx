import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import type { UIMessage } from "ai";
import {
  Check,
  ClipboardCopy,
  DatabaseBackup,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useThreadLifecycle } from "@/hooks/use-thread-lifecycle";
import type { Thread } from "@/lib/chat/types";
import { useWorkspaceTabsStore } from "@/lib/chat/workspace-tabs-store";
import {
  DeleteThreadDialog,
  RenameThreadDialog,
} from "./thread-lifecycle-dialogs";

type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "Copy conversation",
  copied: "Copied to clipboard",
  failed: "Clipboard unavailable",
};

export function ThreadHeaderMenu({
  thread,
  onDeleted,
  readMessages,
}: {
  onDeleted: (thread: Thread) => void;
  readMessages: () => UIMessage[];
  thread: Thread;
}) {
  const resetLocalState = useWorkspaceTabsStore((s) => s.resetLocalState);
  const { busy, error, renameThread, deleteThread, clearError } =
    useThreadLifecycle();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyConversation = async () => {
    const conversation = {
      thread: {
        id: thread.id,
        title: thread.title,
        appId: thread.appId,
        appName: thread.appName,
      },
      messages: readMessages(),
    };
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(conversation, null, 2)
      );
      setCopyState("copied");
    } catch (copyError: unknown) {
      console.error("[chat] copy conversation failed", copyError);
      setCopyState("failed");
    }
  };

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) {
            setCopyState("idle");
          }
        }}
        open={menuOpen}
      >
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Thread actions"
              className="shrink-0 text-muted-foreground"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {/* Held open so the outcome stays legible — a menu that closes on
              click leaves no room to report that the clipboard was refused. */}
          <DropdownMenuItem closeOnClick={false} onClick={copyConversation}>
            {copyState === "copied" ? (
              <Check className="size-4" />
            ) : (
              <ClipboardCopy className="size-4" />
            )}
            {COPY_LABEL[copyState]}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busy}
            onClick={() => {
              clearError();
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-4" />
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
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={resetLocalState}>
            <DatabaseBackup className="size-4" />
            Clear local storage
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
            onDeleted(thread);
          }
          return ok;
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        thread={thread}
      />
    </>
  );
}
