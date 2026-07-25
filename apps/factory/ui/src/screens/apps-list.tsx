import { type ReactNode, useEffect, useState } from "react";
import type { AppRecord } from "../api";
import { AuthRequiredError, listApps } from "../api";
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
    body = <p className="text-[var(--muted)]">Loading apps…</p>;
  } else if (apps.length === 0) {
    body = (
      <p className="text-[var(--muted)]">
        No apps yet. Create one to seed the starter template.
      </p>
    );
  } else {
    body = (
      <ul className="m-0 list-none divide-y divide-[var(--line)] border border-[var(--line)] p-0">
        {apps.map((app) => (
          <li key={app.id}>
            <Link
              to={{ name: "app", appId: app.id }}
              className="flex items-center justify-between gap-4 px-3 py-3 text-[var(--ink)] no-underline hover:bg-[var(--surface)]"
            >
              <span>
                <span className="font-medium">{app.name}</span>
                <span className="mt-0.5 block font-mono text-[var(--muted)] text-xs">
                  {app.id}
                </span>
              </span>
              <StatusBadge status={app.status} />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ConsoleChrome title="Apps">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="m-0 text-[var(--muted)] text-sm">
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
