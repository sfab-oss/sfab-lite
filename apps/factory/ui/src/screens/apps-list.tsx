import { type ReactNode, useEffect, useState } from "react";
import type { AppRecord } from "../api";
import { AuthRequiredError, listApps } from "../api";
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

    const load = () => {
      listApps()
        .then((data) => {
          if (cancelled) {
            return;
          }
          setApps(data.apps);
          setOrganizationId(data.organizationId);
          setError(null);
          if (data.apps.some((a) => a.status === "creating")) {
            schedule(load);
          }
        })
        .catch((e: unknown) => {
          if (cancelled) {
            return;
          }
          if (e instanceof AuthRequiredError) {
            navigate({ name: "sign-in" }, true);
            return;
          }
          setError(e instanceof Error ? e.message : String(e));
        });
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
  if (error) {
    body = <p className="text-[var(--danger)]">{error}</p>;
  } else if (apps === null) {
    body = <p className="text-[var(--muted)]">Loading apps…</p>;
  } else if (apps.length === 0) {
    body = (
      <p className="text-[var(--muted)]">
        No apps yet. Create one to seed the starter template (~18–25s).
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
