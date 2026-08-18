import { AgentSigil } from "@sfab-lite/ui/components/icons/agent-sigil";
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
import { Label } from "@sfab-lite/ui/components/shadcn/label";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { cn } from "@sfab-lite/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  AppLayoutHeader,
  AppLayoutHeaderActions,
} from "@/components/console/app-layout";
import { useApps, useCreateApp } from "@/hooks/query/use-apps";
import type { AppRecord } from "@/lib/api/apps";
import { appBasePath } from "@/lib/preview/reload-preview";
import { StatusDot } from "./status-badge";

const STARTER_CHOICES = [
  { id: "base", label: "Base", description: "Auth, inset shell, empty home" },
  { id: "erp", label: "ERP", description: "Parties, ledger, and balances" },
] as const;

export function AppsListPage() {
  const navigate = useNavigate();
  const appsQuery = useApps();
  const createApp = useCreateApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [template, setTemplate] = useState<string>("base");

  async function onCreate() {
    if (createApp.isPending) {
      return;
    }
    try {
      const created = await createApp.mutateAsync({ template });
      setPickerOpen(false);
      navigate({
        to: "/apps/$appId",
        params: { appId: created.appId },
      });
    } catch {
      // Error surfaced via createApp.error
    }
  }

  const apps = appsQuery.data?.apps ?? null;
  const listError =
    appsQuery.error instanceof Error ? appsQuery.error.message : null;
  const createError =
    createApp.error instanceof Error ? createApp.error.message : null;

  let body: ReactNode;
  if (listError && apps === null) {
    body = <p className="text-destructive">{listError}</p>;
  } else if (appsQuery.isPending) {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div
            className="flex gap-3 rounded-lg border border-border p-4"
            key={key}
          >
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (apps && apps.length === 0) {
    body = (
      <p className="text-muted-foreground">
        No apps yet. Create one to seed a starter.
      </p>
    );
  } else if (apps) {
    const sorted = [...apps].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((app) => (
          <AppCard app={app} key={app.id} />
        ))}
      </div>
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
            onClick={() => {
              setTemplate("base");
              setPickerOpen(true);
            }}
            size="sm"
            type="button"
          >
            {createApp.isPending ? "Creating…" : "New app"}
          </Button>
        </AppLayoutHeaderActions>
      </AppLayoutHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {createError ? (
          <p className="mb-4 text-destructive text-sm">{createError}</p>
        ) : null}
        {listError && apps !== null ? (
          <p className="mb-4 text-destructive text-sm">
            Could not refresh: {listError}
          </p>
        ) : null}
        {body}
      </div>
      <AlertDialog onOpenChange={setPickerOpen} open={pickerOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>New app</AlertDialogTitle>
            <AlertDialogDescription>
              Pick a starter. Base is the default for every new app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2" role="radiogroup">
            {STARTER_CHOICES.map((choice) => {
              const selected = template === choice.id;
              return (
                <label
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-md border p-3",
                    selected
                      ? "border-primary bg-muted/40"
                      : "border-border hover:bg-muted/20"
                  )}
                  key={choice.id}
                >
                  <span className="flex items-center gap-2">
                    <input
                      checked={selected}
                      className="size-4"
                      name="starter"
                      onChange={() => setTemplate(choice.id)}
                      type="radio"
                      value={choice.id}
                    />
                    <Label className="font-medium text-sm">
                      {choice.label}
                    </Label>
                  </span>
                  <span className="pl-6 text-muted-foreground text-xs">
                    {choice.description}
                  </span>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createApp.isPending} type="button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={createApp.isPending}
              onClick={(event) => {
                event.preventDefault();
                onCreate().catch(() => undefined);
              }}
              type="button"
            >
              {createApp.isPending ? "Creating…" : "Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AppCard({ app }: { app: AppRecord }) {
  const livePath = `${appBasePath(app.id)}/`;
  const shortSha = app.liveSha ? app.liveSha.slice(0, 12) : null;

  return (
    <Link
      className={cn(
        "flex gap-3 rounded-lg border border-border bg-background p-4",
        "text-foreground no-underline transition-colors hover:bg-muted/30"
      )}
      params={{ appId: app.id }}
      to="/apps/$appId"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
        <AgentSigil className="size-6" grid id={app.id} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="m-0 truncate font-medium text-sm">{app.name}</p>
            <p className="m-0 mt-0.5 truncate font-mono text-muted-foreground text-xs">
              {app.status === "ready" ? livePath : app.id}
            </p>
          </div>
          <StatusDot status={app.status} />
        </div>
        <p className="m-0 mt-3 truncate text-muted-foreground text-sm">
          {activityLabel(app, shortSha)}
        </p>
        <p className="m-0 mt-2 text-muted-foreground text-xs">
          Updated {formatWhen(app.updatedAt)}
        </p>
      </div>
    </Link>
  );
}

function activityLabel(app: AppRecord, shortSha: string | null): string {
  if (app.status === "creating") {
    return "Creating app…";
  }
  if (app.status === "failed") {
    return "Create failed";
  }
  if (shortSha) {
    return `Production · ${shortSha}`;
  }
  return "No live deployment yet";
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}
