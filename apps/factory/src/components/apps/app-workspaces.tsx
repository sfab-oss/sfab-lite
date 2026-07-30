import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@sfab-lite/ui/components/shadcn/alert-dialog";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Input } from "@sfab-lite/ui/components/shadcn/input";
import { Label } from "@sfab-lite/ui/components/shadcn/label";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useRenameWorkspace,
  useSetDefaultWorkspace,
  useWorkspaces,
} from "@/hooks/query/use-workspaces";
import type { WorkspaceRecord } from "@/lib/api/workspaces";

export function AppWorkspacesPage({ appId }: { appId: string }) {
  const query = useWorkspaces(appId);
  const workspaces = query.data ?? [];
  const create = useCreateWorkspace(appId);
  const rename = useRenameWorkspace(appId);
  const setDefault = useSetDefaultWorkspace(appId);
  const remove = useDeleteWorkspace(appId);

  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<WorkspaceRecord | null>(
    null
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRecord | null>(
    null
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const createInputId = useId();
  const renameInputId = useId();

  const onCreate = async () => {
    const name = createName.trim();
    if (!name) {
      setCreateError("Name is required");
      return;
    }
    setCreateError(null);
    setActionError(null);
    try {
      await create.mutateAsync(name);
      setCreateName("");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "create failed");
    }
  };

  const onRename = async () => {
    if (!renameTarget) {
      return;
    }
    const name = renameDraft.trim();
    if (!name) {
      setRenameError("Name is required");
      return false;
    }
    setRenameError(null);
    try {
      await rename.mutateAsync({
        workspaceId: renameTarget.id,
        name,
      });
      setRenameTarget(null);
      return true;
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "rename failed");
      return false;
    }
  };

  const onSetDefault = async (workspace: WorkspaceRecord) => {
    if (workspace.isDefault) {
      return;
    }
    setActionError(null);
    try {
      await setDefault.mutateAsync(workspace.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "set default failed");
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) {
      return false;
    }
    setDeleteError(null);
    try {
      await remove.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      return true;
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "delete failed");
      return false;
    }
  };

  const busy =
    create.isPending ||
    rename.isPending ||
    setDefault.isPending ||
    remove.isPending;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="m-0 font-semibold text-xl tracking-tight">
            Workspaces
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Isolated work environments for this app.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate().catch(() => undefined);
          }}
        >
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <Label htmlFor={createInputId}>New workspace</Label>
            <Input
              disabled={busy}
              id={createInputId}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Name"
              value={createName}
            />
          </div>
          <Button disabled={busy || !createName.trim()} type="submit">
            Create
          </Button>
        </form>
        {createError ? (
          <p className="-mt-3 text-destructive text-sm" role="alert">
            {createError}
          </p>
        ) : null}
        {actionError ? (
          <p className="-mt-3 text-destructive text-sm" role="alert">
            {actionError}
          </p>
        ) : null}

        {query.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {query.error instanceof Error ? (
          <p className="text-destructive text-sm">{query.error.message}</p>
        ) : null}

        {query.isSuccess ? (
          <ul className="m-0 list-none divide-y border-border border-y p-0">
            {workspaces.map((workspace) => (
              <li
                className="flex flex-wrap items-center gap-3 py-3"
                key={workspace.id}
              >
                <Link
                  className="min-w-0 flex-1 text-sm no-underline hover:bg-muted/40"
                  params={{ appId, workspaceId: workspace.id }}
                  to="/apps/$appId/workspaces/$workspaceId/work"
                >
                  <span className="font-medium text-foreground">
                    {workspace.name}
                    {workspace.isDefault ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block font-mono text-muted-foreground text-xs">
                    {workspace.id}
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setRenameTarget(workspace);
                      setRenameDraft(workspace.name);
                      setRenameError(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Rename
                  </Button>
                  <Button
                    disabled={busy || workspace.isDefault}
                    onClick={() => {
                      onSetDefault(workspace).catch(() => undefined);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Set default
                  </Button>
                  <Button
                    disabled={
                      busy || workspace.isDefault || workspaces.length <= 1
                    }
                    onClick={() => {
                      setDeleteTarget(workspace);
                      setDeleteError(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        open={Boolean(renameTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Rename workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a name for this workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onRename().catch(() => undefined);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={renameInputId}>Name</Label>
              <Input
                aria-invalid={Boolean(renameError)}
                disabled={rename.isPending}
                id={renameInputId}
                onChange={(event) => setRenameDraft(event.target.value)}
                value={renameDraft}
              />
              {renameError ? (
                <p className="text-destructive text-sm" role="alert">
                  {renameError}
                </p>
              ) : null}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rename.isPending} type="button">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction disabled={rename.isPending} type="submit">
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” and its agent state will be permanently
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-destructive text-sm" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                onDelete().catch(() => undefined);
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
