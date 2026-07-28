import type { AppRecord, AttemptRecord, VersionSummary } from "../api";
import { AppLayoutHeader } from "../components/brand/app-layout";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useApp, useAppAttempt, useAppVersions } from "../hooks/use-apps";
import { useAuthRequiredRedirect } from "../hooks/use-auth-required-redirect";
import { Link } from "../router";
import { StatusBadge } from "./apps-list";

export function AppDetailScreen({ appId }: { appId: string }) {
  const appQuery = useApp(appId);
  const app = appQuery.data ?? null;
  const versionsQuery = useAppVersions(appId, app?.status === "ready");
  const attemptQuery = useAppAttempt(
    appId,
    app?.status === "creating" || app?.status === "failed"
      ? app.createAttemptId
      : null,
    { poll: app?.status === "creating" }
  );

  useAuthRequiredRedirect(
    appQuery.error ?? versionsQuery.error ?? attemptQuery.error
  );

  let error: string | null = null;
  if (appQuery.error instanceof Error) {
    error = appQuery.error.message;
  } else if (versionsQuery.error instanceof Error) {
    error = versionsQuery.error.message;
  }

  return (
    <>
      <AppLayoutHeader className="px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            to={{ name: "apps" }}
            className="shrink-0 text-muted-foreground text-sm no-underline hover:underline"
          >
            Apps
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="truncate font-medium text-sm">
            {app?.name ?? "App"}
          </span>
        </div>
      </AppLayoutHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error ? <p className="text-destructive">{error}</p> : null}

        {appQuery.isPending && !app ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-48" />
            <div className="mt-2 flex gap-3">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        ) : null}

        {app ? (
          <AppBody
            app={app}
            attempt={attemptQuery.data ?? null}
            versions={versionsQuery.data?.versions ?? null}
            liveVersionId={versionsQuery.data?.liveVersionId ?? null}
          />
        ) : null}
      </div>
    </>
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
            <dt className="w-28 text-muted-foreground">Id</dt>
            <dd className="m-0 font-mono">{app.id}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Status</dt>
            <dd className="m-0">
              <StatusBadge status={app.status} />
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Created</dt>
            <dd className="m-0">{formatWhen(app.createdAt)}</dd>
          </div>
        </dl>

        {app.status === "ready" ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              render={
                <a
                  href={`/a/${encodeURIComponent(app.id)}/`}
                  rel="noreferrer"
                  target="_blank"
                />
              }
            >
              Open live
            </Button>
            <Button
              render={
                <a
                  href={`/a/${encodeURIComponent(app.id)}/preview`}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              variant="outline"
            >
              Open preview
            </Button>
          </div>
        ) : null}

        {app.status === "creating" ? (
          <p className="mt-4 text-muted-foreground text-sm">
            Seeding the template while check runs. Polling automatically.
          </p>
        ) : null}
      </section>

      <AttemptSection app={app} attempt={attempt} />

      {app.status === "failed" && !app.createAttemptId ? (
        <p className="text-destructive text-sm">
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
          <dt className="w-28 text-muted-foreground">Id</dt>
          <dd className="m-0 font-mono text-xs">{attempt.id}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-28 text-muted-foreground">Status</dt>
          <dd className="m-0">{attempt.status}</dd>
        </div>
      </dl>
      {attempt.payload == null ? null : (
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
          {formatPayload(attempt.payload)}
        </pre>
      )}
      {app.status === "failed" && attempt.payload == null ? (
        <p className="mt-2 text-destructive text-sm">
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
        <p className="text-muted-foreground text-sm">No versions yet.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0 text-sm">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="font-mono text-xs">
                {v.id}
                {v.id === liveVersionId ? (
                  <>
                    {" "}
                    <span className="font-sans text-primary">live</span>
                  </>
                ) : null}
              </span>
              <span className="text-muted-foreground">
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
