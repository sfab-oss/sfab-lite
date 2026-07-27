import { useEffect, useId, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Thread } from "../model/types";

export function RenameThreadDialog({
  open,
  onOpenChange,
  thread,
  busy,
  onRename,
}: {
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (title: string) => Promise<boolean>;
  open: boolean;
  thread: Thread;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(thread.title);

  useEffect(() => {
    if (open) {
      setDraft(thread.title);
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, thread.title]);

  const submit = async () => {
    const ok = await onRename(draft);
    if (ok || !draft.trim()) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Rename thread</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a title for this conversation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit().catch(() => undefined);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>Title</Label>
            <Input
              disabled={busy}
              id={inputId}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onOpenChange(false);
                }
              }}
              ref={inputRef}
              value={draft}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} type="button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction disabled={busy} type="submit">
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteThreadDialog({
  open,
  onOpenChange,
  thread,
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  thread: Thread;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
          <AlertDialogDescription>
            “{thread.title}” will be permanently deleted, including its
            messages. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm()
                .then((ok) => {
                  if (ok) {
                    onOpenChange(false);
                  }
                })
                .catch(() => undefined);
            }}
            variant="destructive"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
