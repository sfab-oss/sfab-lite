import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import type { AppRecord } from "../api";
import {
  AppLayoutHeader,
  AppLayoutHeaderActions,
} from "../components/brand/app-layout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import {
  useApps,
  useCreateApp,
  useDeleteApp,
  useRenameApp,
} from "../hooks/use-apps";

export function AppsListScreen() {
  const navigate = useNavigate();
  const appsQuery = useApps();
  const createApp = useCreateApp();

  async function onCreate() {
    if (createApp.isPending) {
      return;
    }
    try {
      const created = await createApp.mutateAsync(undefined);
      navigate({
        to: "/apps/$appId",
        params: { appId: created.appId },
      });
    } catch {
      // Error surfaced via createApp.error
    }
  }

  const apps = appsQuery.data?.apps ?? null;
  const organizationId = appsQuery.data?.organizationId ?? null;
  const listError =
    appsQuery.error instanceof Error ? appsQuery.error.message : null;
  const createError =
    createApp.error instanceof Error ? createApp.error.message : null;

  let body: ReactNode;
  if (listError && apps === null) {
    body = <p className="text-destructive">{listError}</p>;
  } else if (appsQuery.isPending) {
    body = (
      <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0">
        {[0, 1, 2].map((key) => (
          <li className="flex items-center gap-4 px-3 py-3" key={key}>
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-14" />
          </li>
        ))}
      </ul>
    );
  } else if (apps && apps.length === 0) {
    body = (
      <p className="text-muted-foreground">
        No apps yet. Create one to seed the starter template.
      </p>
    );
  } else if (apps) {
    body = (
      <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0">
        {apps.map((app) => (
          <li key={app.id} className="flex items-center hover:bg-muted">
            <Link
              className="flex flex-1 items-center justify-between gap-4 px-3 py-3 text-foreground no-underline hover:underline"
              params={{ appId: app.id }}
              to="/apps/$appId"
            >
              <span>
                <span className="font-medium">{app.name}</span>
                <span className="mt-0.5 block font-mono text-muted-foreground text-xs">
                  {app.id}
                </span>
              </span>
              <StatusBadge status={app.status} />
            </Link>
            <RenameAppButton app={app} />
            <DeleteAppButton app={app} />
          </li>
        ))}
      </ul>
    );
  } else {
    body = null;
  }

  return (
    <>
      <AppLayoutHeader className="px-3">
        <span className="truncate font-medium text-sm">Apps</span>
        <AppLayoutHeaderActions>
          <Button
            disabled={createApp.isPending}
            onClick={onCreate}
            size="sm"
            type="button"
          >
            {createApp.isPending ? "Creating…" : "New app"}
          </Button>
        </AppLayoutHeaderActions>
      </AppLayoutHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mb-6">
          <p className="m-0 text-muted-foreground text-sm">
            Organization{" "}
            <code className="text-foreground">{organizationId ?? "…"}</code>
          </p>
          {createError ? (
            <p className="mt-2 text-destructive text-sm">{createError}</p>
          ) : null}
        </div>
        {listError && apps !== null ? (
          <p className="mb-4 text-destructive text-sm">
            Could not refresh: {listError}
          </p>
        ) : null}
        {body}
      </div>
    </>
  );
}

const APP_NAME_MAX_LENGTH = 64;

function RenameAppButton({ app }: { app: AppRecord }) {
  const [draft, setDraft] = useState<string | null>(null);
  const renameApp = useRenameApp();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = draft?.trim();
    if (!name || name === app.name) {
      setDraft(null);
      return;
    }
    try {
      await renameApp.mutateAsync({ appId: app.id, name });
      setDraft(null);
    } catch {
      // Error on mutation
    }
  }

  if (draft === null) {
    return (
      <Button
        aria-label={`Rename ${app.name}`}
        className="text-muted-foreground"
        onClick={() => {
          renameApp.reset();
          setDraft(app.name);
        }}
        size="xs"
        type="button"
        variant="ghost"
      >
        Rename
      </Button>
    );
  }

  const error =
    renameApp.error instanceof Error ? renameApp.error.message : null;

  return (
    <form className="flex items-center gap-2 px-2 py-2" onSubmit={onSubmit}>
      <Input
        autoFocus
        aria-label={`New name for ${app.name}`}
        className="h-7 w-40 text-xs"
        disabled={renameApp.isPending}
        maxLength={APP_NAME_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      <Button
        disabled={renameApp.isPending}
        size="xs"
        type="submit"
        variant="ghost"
      >
        {renameApp.isPending ? "Saving…" : "Save"}
      </Button>
      <Button
        disabled={renameApp.isPending}
        onClick={() => setDraft(null)}
        size="xs"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </form>
  );
}

function DeleteAppButton({ app }: { app: AppRecord }) {
  const [armed, setArmed] = useState(false);
  const deleteApp = useDeleteApp();

  async function onDelete() {
    try {
      await deleteApp.mutateAsync(app.id);
    } catch {
      setArmed(false);
    }
  }

  const error =
    deleteApp.error instanceof Error ? deleteApp.error.message : null;

  if (error) {
    return <span className="px-3 py-3 text-destructive text-xs">{error}</span>;
  }

  if (!armed) {
    return (
      <Button
        aria-label={`Delete ${app.name}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          deleteApp.reset();
          setArmed(true);
        }}
        size="xs"
        type="button"
        variant="ghost"
      >
        Delete
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1 px-2 py-2 text-xs">
      <Button
        disabled={deleteApp.isPending}
        onClick={onDelete}
        size="xs"
        type="button"
        variant="destructive"
      >
        {deleteApp.isPending ? "Deleting…" : "Confirm"}
      </Button>
      <Button
        disabled={deleteApp.isPending}
        onClick={() => setArmed(false)}
        size="xs"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
    </span>
  );
}

export function StatusBadge({ status }: { status: AppRecord["status"] }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (status === "ready") {
    variant = "default";
  } else if (status === "failed") {
    variant = "destructive";
  } else if (status === "creating") {
    variant = "secondary";
  }
  return (
    <Badge className="uppercase tracking-wide" variant={variant}>
      {status}
    </Badge>
  );
}
