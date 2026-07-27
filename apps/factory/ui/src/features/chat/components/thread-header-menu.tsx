import { DatabaseBackup, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThreadLifecycle } from "../hooks/use-thread-lifecycle";
import { useWorkspaceTabsStore } from "../lib/workspace-tabs-store";
import type { Thread } from "../model/types";
import {
  DeleteThreadDialog,
  RenameThreadDialog,
} from "./thread-lifecycle-dialogs";

export function ThreadHeaderMenu({
  thread,
  onDeleted,
}: {
  onDeleted: (thread: Thread) => void;
  thread: Thread;
}) {
  const resetLocalState = useWorkspaceTabsStore((s) => s.resetLocalState);
  const { busy, error, renameThread, deleteThread, clearError } =
    useThreadLifecycle();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
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
        <DropdownMenuContent align="start" className="w-48">
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
