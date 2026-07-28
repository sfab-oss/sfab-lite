import { type ReactNode, useEffect, useState } from "react";
import type { AppRecord } from "../api";
import { AuthRequiredError, deleteApp, listApps, renameApp } from "../api";
import { endUnusableSession } from "../auth-client";
import {
  AppLayoutHeader,
  AppLayoutHeaderActions,
} from "../components/brand/app-layout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { createReadyApp } from "../lib/create-ready-app";
import { Link, useRouter } from "../router";

const POLL_MS = 2500;

export function AppsListScreen({
  onAppCreated,
}: {
  onAppCreated?: (appId: string, appName: string) => void;
} = {}) {
  const { navigate } = useRouter();
  const [apps, setApps] = useState<AppRecord[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (fn: () => void) => {
      timer = setTimeout(fn, POLL_MS);
    };

    // Whether the last successful poll saw an app still being created. A
    // failed poll must know this, because the request that would have told
    // us is the one that just failed.
    let awaitingCreate = false;

    const onLoadError = async (e: unknown) => {
      if (cancelled) {
        return;
      }
      if (e instanceof AuthRequiredError) {
        await endUnusableSession();
        if (!cancelled) {
          navigate({ name: "sign-in" }, true);
        }
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      // Keep polling through a transient failure. Creation runs server-side
      // and settles whether or not this page is watching; giving up on one
      // bad response would strand the row on `creating` until a manual
      // reload, long after it had reached `ready`.
      if (awaitingCreate) {
        schedule(load);
      }
    };

    const load = () => {
      listApps()
        .then((data) => {
          if (cancelled) {
            return;
          }
          setApps(data.apps);
          setOrganizationId(data.organizationId);
          setError(null);
          awaitingCreate = data.apps.some((a) => a.status === "creating");
          if (awaitingCreate) {
            schedule(load);
          }
        })
        .catch(onLoadError);
    };

    load();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [navigate]);

  async function onCreate() {
    if (creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createReadyApp();
      onAppCreated?.(created.appId, created.name);
      navigate({ name: "app", appId: created.appId });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  let body: ReactNode;
  // An error replaces the list only when there is no list yet. Once apps have
  // loaded, a later failed poll shows the error *above* them: the rows are
  // still the last thing the server said, and blanking the page over one bad
  // response loses more than it protects.
  if (error && apps === null) {
    body = <p className="text-destructive">{error}</p>;
  } else if (apps === null) {
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
  } else if (apps.length === 0) {
    body = (
      <p className="text-muted-foreground">
        No apps yet. Create one to seed the starter template.
      </p>
    );
  } else {
    body = (
      <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0">
        {apps.map((app) => (
          // The delete control is a sibling of the Link, not inside it —
          // nesting a button in an anchor gives one row two conflicting
          // activation targets.
          <li key={app.id} className="flex items-center hover:bg-muted">
            <Link
              to={{ name: "app", appId: app.id }}
              className="flex flex-1 items-center justify-between gap-4 px-3 py-3 text-foreground no-underline hover:underline"
            >
              <span>
                <span className="font-medium">{app.name}</span>
                <span className="mt-0.5 block font-mono text-muted-foreground text-xs">
                  {app.id}
                </span>
              </span>
              <StatusBadge status={app.status} />
            </Link>
            <RenameAppButton
              app={app}
              onRenamed={(name) =>
                setApps((prev) =>
                  prev
                    ? prev.map((a) => (a.id === app.id ? { ...a, name } : a))
                    : prev
                )
              }
            />
            <DeleteAppButton
              app={app}
              onDeleted={() =>
                setApps((prev) =>
                  prev ? prev.filter((a) => a.id !== app.id) : prev
                )
              }
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <AppLayoutHeader className="px-3">
        <span className="truncate font-medium text-sm">Apps</span>
        <AppLayoutHeaderActions>
          <Button
            disabled={creating}
            onClick={onCreate}
            size="sm"
            type="button"
          >
            {creating ? "Creating…" : "New app"}
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
        {error && apps !== null && (
          <p className="mb-4 text-destructive text-sm">
            Could not refresh: {error}
          </p>
        )}
        {body}
      </div>
    </>
  );
}

const APP_NAME_MAX_LENGTH = 64;

/**
 * Edits in place rather than in a dialog: the row already shows the name and
 * the id it belongs to, which is everything a rename needs to be unambiguous.
 */
function RenameAppButton({
  app,
  onRenamed,
}: {
  app: AppRecord;
  onRenamed: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = draft?.trim();
    if (!name || name === app.name) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await renameApp(app.id, name);
      onRenamed(updated.name);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (draft === null) {
    return (
      <Button
        aria-label={`Rename ${app.name}`}
        className="text-muted-foreground"
        onClick={() => {
          setError(null);
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

  return (
    <form className="flex items-center gap-2 px-2 py-2" onSubmit={onSubmit}>
      <Input
        autoFocus
        aria-label={`New name for ${app.name}`}
        className="h-7 w-40 text-xs"
        disabled={busy}
        maxLength={APP_NAME_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      <Button disabled={busy} size="xs" type="submit" variant="ghost">
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button
        disabled={busy}
        onClick={() => setDraft(null)}
        size="xs"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </form>
  );
}

/**
 * Two-press delete: the first press arms, the second commits.
 *
 * Arming in place rather than `window.confirm` because the row itself is the
 * confirmation — the button sits next to the name and id being destroyed,
 * where a modal would restate them and still be dismissed by reflex.
 */
function DeleteAppButton({
  app,
  onDeleted,
}: {
  app: AppRecord;
  onDeleted: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteApp(app.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setArmed(false);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <span className="px-3 py-3 text-destructive text-xs">{error}</span>;
  }

  if (!armed) {
    return (
      <Button
        aria-label={`Delete ${app.name}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setArmed(true)}
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
        disabled={busy}
        onClick={onDelete}
        size="xs"
        type="button"
        variant="destructive"
      >
        {busy ? "Deleting…" : "Confirm"}
      </Button>
      <Button
        disabled={busy}
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
