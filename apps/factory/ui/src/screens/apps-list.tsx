import { type ReactNode, useEffect, useState } from "react";
import type { AppRecord } from "../api";
import { AuthRequiredError, deleteApp, listApps } from "../api";
import { endUnusableSession } from "../auth-client";
import { Link, useRouter } from "../router";
import { ConsoleChrome } from "./chrome";

const POLL_MS = 2500;

export function AppsListScreen() {
  const { navigate } = useRouter();
  const [apps, setApps] = useState<AppRecord[] | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  let body: ReactNode;
  // An error replaces the list only when there is no list yet. Once apps have
  // loaded, a later failed poll shows the error *above* them: the rows are
  // still the last thing the server said, and blanking the page over one bad
  // response loses more than it protects.
  if (error && apps === null) {
    body = <p className="text-[var(--danger)]">{error}</p>;
  } else if (apps === null) {
    body = <p className="text-[var(--muted-foreground)]">Loading apps…</p>;
  } else if (apps.length === 0) {
    body = (
      <p className="text-[var(--muted-foreground)]">
        No apps yet. Create one to seed the starter template.
      </p>
    );
  } else {
    body = (
      <ul className="m-0 list-none divide-y divide-[var(--line)] border border-[var(--line)] p-0">
        {apps.map((app) => (
          // The delete control is a sibling of the Link, not inside it —
          // nesting a button in an anchor gives one row two conflicting
          // activation targets.
          <li
            key={app.id}
            className="flex items-center hover:bg-[var(--surface)]"
          >
            <Link
              to={{ name: "app", appId: app.id }}
              className="flex flex-1 items-center justify-between gap-4 px-3 py-3 text-[var(--ink)] no-underline"
            >
              <span>
                <span className="font-medium">{app.name}</span>
                <span className="mt-0.5 block font-mono text-[var(--muted-foreground)] text-xs">
                  {app.id}
                </span>
              </span>
              <StatusBadge status={app.status} />
            </Link>
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
    <ConsoleChrome title="Apps">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[var(--muted-foreground)] text-sm">
            Organization{" "}
            <code className="text-[var(--ink)]">{organizationId ?? "…"}</code>
          </p>
        </div>
        <Link
          to={{ name: "create" }}
          className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-sm text-white no-underline"
        >
          New app
        </Link>
      </div>
      {error && apps !== null && (
        <p className="mb-4 text-[var(--danger)] text-sm">
          Could not refresh: {error}
        </p>
      )}
      {body}
    </ConsoleChrome>
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
    return (
      <span className="px-3 py-3 text-[var(--danger)] text-xs">{error}</span>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={`Delete ${app.name}`}
        className="border-0 bg-transparent px-3 py-3 text-[var(--muted-foreground)] text-xs hover:text-[var(--danger)]"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 px-3 py-3 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="border-0 bg-transparent p-0 font-medium text-[var(--danger)] disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setArmed(false)}
        className="border-0 bg-transparent p-0 text-[var(--muted-foreground)] disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}

export function StatusBadge({ status }: { status: AppRecord["status"] }) {
  let color = "var(--warn)";
  if (status === "ready") {
    color = "var(--ok)";
  } else if (status === "failed") {
    color = "var(--danger)";
  }
  return (
    <span
      className="font-medium text-xs uppercase tracking-wide"
      style={{ color }}
    >
      {status}
    </span>
  );
}
