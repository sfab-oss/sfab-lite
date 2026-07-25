import { useEffect, useState } from "react";
import type { AppRecord, AttemptRecord, VersionSummary } from "../api";
import { AuthRequiredError, getApp, getAttempt, listVersions } from "../api";
import { endUnusableSession } from "../auth-client";
import { Link, useRouter } from "../router";
import { StatusBadge } from "./apps-list";
import { ConsoleChrome } from "./chrome";

const POLL_MS = 2500;

export function AppDetailScreen({ appId }: { appId: string }) {
  const { navigate } = useRouter();
  const [app, setApp] = useState<AppRecord | null>(null);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [liveVersionId, setLiveVersionId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Whether the last successful poll saw this app still being created — a
    // failed poll cannot ask, since the request that would answer is the one
    // that failed.
    let awaitingCreate = false;

    const loadReady = async (record: AppRecord) => {
      const listed = await listVersions(appId);
      if (cancelled) {
        return;
      }
      setApp(record);
      setVersions(listed.versions);
      setLiveVersionId(listed.liveVersionId);
      setAttempt(null);
      setError(null);
      awaitingCreate = false;
    };

    const loadPending = async (record: AppRecord) => {
      let nextAttempt: AttemptRecord | null = null;
      if (record.createAttemptId) {
        nextAttempt = await getAttempt(appId, record.createAttemptId);
      }
      if (cancelled) {
        return;
      }
      setApp(record);
      setAttempt(nextAttempt);
      setError(null);
      awaitingCreate = record.status === "creating";
      if (awaitingCreate) {
        timer = setTimeout(() => {
          load();
        }, POLL_MS);
      }
    };

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
      // Same reason as the apps list: creation settles server-side whether or
      // not this screen is watching, so one failed poll must not end the
      // watch.
      if (awaitingCreate) {
        timer = setTimeout(() => {
          load();
        }, POLL_MS);
      }
    };

    const load = () => {
      getApp(appId)
        .then(async (record) => {
          if (cancelled) {
            return;
          }
          if (record.status === "ready") {
            await loadReady(record);
            return;
          }
          await loadPending(record);
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
  }, [appId, navigate]);

  return (
    <ConsoleChrome title={app?.name ?? "App"}>
      <p className="mt-0 mb-6">
        <Link to={{ name: "apps" }} className="text-sm">
          ← Apps
        </Link>
      </p>

      {error ? <p className="text-[var(--danger)]">{error}</p> : null}

      {app || error ? null : (
        <p className="text-[var(--muted-foreground)]">Loading…</p>
      )}

      {app ? (
        <AppBody
          app={app}
          attempt={attempt}
          versions={versions}
          liveVersionId={liveVersionId}
        />
      ) : null}
    </ConsoleChrome>
  );
}

function AppBody({
  app,
  attempt,
  versions,
  liveVersionId,
}: {
  app: AppRecord;
  attempt: AttemptRecord | null;
  versions: VersionSummary[] | null;
  liveVersionId: string | null;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <dl className="m-0 grid gap-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-28 text-[var(--muted-foreground)]">Id</dt>
            <dd className="m-0 font-mono">{app.id}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-[var(--muted-foreground)]">Status</dt>
            <dd className="m-0">
              <StatusBadge status={app.status} />
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-[var(--muted-foreground)]">Created</dt>
            <dd className="m-0">{formatWhen(app.createdAt)}</dd>
          </div>
        </dl>

        {app.status === "ready" ? (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <a
              href={`/a/${encodeURIComponent(app.id)}/`}
              className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-white no-underline"
              target="_blank"
              rel="noreferrer"
            >
              Open live
            </a>
            <a
              href={`/a/${encodeURIComponent(app.id)}/preview`}
              className="border border-[var(--line)] px-3 py-1.5 text-[var(--ink)] no-underline"
              target="_blank"
              rel="noreferrer"
            >
              Open preview
            </a>
          </div>
        ) : null}

        {app.status === "creating" ? (
          <p className="mt-4 text-[var(--warn)] text-sm">
            Seeding the template while check runs. Polling automatically.
          </p>
        ) : null}
      </section>

      <AttemptSection app={app} attempt={attempt} />

      {app.status === "failed" && !app.createAttemptId ? (
        <p className="text-[var(--danger)] text-sm">
          Create failed during bootstrap (no attempt id).
        </p>
      ) : null}

      {app.status === "ready" && versions ? (
        <VersionsSection versions={versions} liveVersionId={liveVersionId} />
      ) : null}
    </div>
  );
}

function AttemptSection({
  app,
  attempt,
}: {
  app: AppRecord;
  attempt: AttemptRecord | null;
}) {
  if (!((app.status === "creating" || app.status === "failed") && attempt)) {
    return null;
  }
  return (
    <section>
      <h2 className="m-0 mb-2 font-semibold text-base">Create attempt</h2>
      <dl className="m-0 grid gap-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-28 text-[var(--muted-foreground)]">Id</dt>
          <dd className="m-0 font-mono text-xs">{attempt.id}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-28 text-[var(--muted-foreground)]">Status</dt>
          <dd className="m-0">{attempt.status}</dd>
        </div>
      </dl>
      {attempt.payload == null ? null : (
        <pre className="mt-3 overflow-x-auto border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
          {formatPayload(attempt.payload)}
        </pre>
      )}
      {app.status === "failed" && attempt.payload == null ? (
        <p className="mt-2 text-[var(--danger)] text-sm">
          Create failed before an attempt payload was recorded.
        </p>
      ) : null}
    </section>
  );
}

function VersionsSection({
  versions,
  liveVersionId,
}: {
  versions: VersionSummary[];
  liveVersionId: string | null;
}) {
  return (
    <section>
      <h2 className="m-0 mb-2 font-semibold text-base">Versions</h2>
      {versions.length === 0 ? (
        <p className="text-[var(--muted-foreground)] text-sm">
          No versions yet.
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-[var(--line)] border border-[var(--line)] p-0 text-sm">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="font-mono text-xs">
                {v.id}
                {v.id === liveVersionId ? (
                  <>
                    {/* A literal space, not just the margin: without it the
                        DOM text reads `v_01…live`, which is what a screen
                        reader announces and what a copy-paste produces. */}{" "}
                    <span className="text-[var(--ok)]">live</span>
                  </>
                ) : null}
              </span>
              <span className="text-[var(--muted-foreground)]">
                {new Date(v.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatWhen(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
