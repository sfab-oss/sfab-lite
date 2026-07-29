import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import type { AppRecord, AttemptRecord } from "../api";
import { AppLayoutHeader } from "../components/brand/app-layout";
import { useApp, useAppAttempt } from "../hooks/use-apps";
import { StatusBadge } from "./apps-list";

export function AppDetailScreen({ appId }: { appId: string }) {
  const appQuery = useApp(appId);
  const app = appQuery.data ?? null;
  const attemptQuery = useAppAttempt(
    appId,
    app?.status === "creating" || app?.status === "failed"
      ? app.createAttemptId
      : null,
    { poll: app?.status === "creating" }
  );

  let error: string | null = null;
  if (appQuery.error instanceof Error) {
    error = appQuery.error.message;
  }

  return (
    <>
      <AppLayoutHeader className="px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            className="shrink-0 text-muted-foreground text-sm no-underline hover:underline"
            to="/apps"
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

        {app ? <AppBody app={app} attempt={attemptQuery.data ?? null} /> : null}
      </div>
    </>
  );
}

function AppBody({
  app,
  attempt,
}: {
  app: AppRecord;
  attempt: AttemptRecord | null;
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
            <dt className="w-28 text-muted-foreground">Live sha</dt>
            <dd className="m-0 font-mono text-xs">
              {app.liveSha ? app.liveSha.slice(0, 12) : "—"}
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
                <Link params={{ appId: app.id }} to="/apps/$appId/preview" />
              }
              variant="outline"
            >
              Open preview
            </Button>
          </div>
        ) : null}

        {app.status === "creating" ? (
          <p className="mt-4 text-muted-foreground text-sm">
            Initializing the repo and running CD. Polling automatically.
          </p>
        ) : null}
      </section>

      <AttemptSection app={app} attempt={attempt} />

      {app.status === "failed" && !app.createAttemptId ? (
        <p className="text-destructive text-sm">
          Create failed during bootstrap (no job id).
        </p>
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
      <h2 className="m-0 mb-2 font-semibold text-base">Create job</h2>
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
          Create failed before a job payload was recorded.
        </p>
      ) : null}
    </section>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
