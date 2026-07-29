import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import type {
  AppRecord,
  AttemptRecord,
  CheckRunRecord,
  PrRecord,
} from "../api";
import { useApp, useAppAttempt } from "../hooks/use-apps";
import { usePrs, useRuns } from "../hooks/use-prs";
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
  const prsQuery = usePrs(appId);
  const runsQuery = useRuns(appId);

  let error: string | null = null;
  if (appQuery.error instanceof Error) {
    error = appQuery.error.message;
  }

  const openPrs = (prsQuery.data ?? []).filter((pr) => pr.status === "open");
  const latestRun = runsQuery.data?.[0] ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      {error ? <p className="text-destructive">{error}</p> : null}

      {appQuery.isPending && !app ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full max-w-lg" />
        </div>
      ) : null}

      {app ? (
        <OverviewBody
          app={app}
          attempt={attemptQuery.data ?? null}
          latestRun={latestRun}
          openPrs={openPrs}
        />
      ) : null}
    </div>
  );
}

function OverviewBody({
  app,
  attempt,
  openPrs,
  latestRun,
}: {
  app: AppRecord;
  attempt: AttemptRecord | null;
  latestRun: CheckRunRecord | null;
  openPrs: PrRecord[];
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-semibold text-xl">{app.name}</h1>
        <StatusBadge status={app.status} />
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="m-0 mb-3 font-medium text-sm">Production</h2>
        <p className="m-0 font-mono text-muted-foreground text-xs">
          {app.liveSha ? app.liveSha.slice(0, 12) : "No live deployment yet"}
        </p>
        {app.status === "ready" && app.liveSha ? (
          <div className="mt-3">
            <Button
              render={
                <a
                  href={`/a/${encodeURIComponent(app.id)}/`}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              size="sm"
            >
              Open live
            </Button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-lg border border-border p-4 text-foreground no-underline transition-colors hover:bg-muted/40"
          params={{ appId: app.id }}
          to="/apps/$appId/prs"
        >
          <p className="m-0 font-medium text-sm">Open pull requests</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {prsPulseLabel(openPrs.length)}
          </p>
        </Link>
        <Link
          className="rounded-lg border border-border p-4 text-foreground no-underline transition-colors hover:bg-muted/40"
          params={{ appId: app.id }}
          to="/apps/$appId/actions"
        >
          <p className="m-0 font-medium text-sm">Latest check</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {latestRunPulse(latestRun)}
          </p>
        </Link>
      </section>

      {app.status === "ready" ? (
        <div>
          <Button
            render={<Link params={{ appId: app.id }} to="/apps/$appId/agent" />}
          >
            Open Agent
          </Button>
        </div>
      ) : null}

      {app.status === "creating" ? (
        <p className="m-0 text-muted-foreground text-sm">
          Initializing the repo and running CD. Polling automatically.
        </p>
      ) : null}

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

function prsPulseLabel(count: number): string {
  if (count === 0) {
    return "None open";
  }
  if (count === 1) {
    return "1 open";
  }
  return `${count} open`;
}

function latestRunPulse(run: CheckRunRecord | null): string {
  if (!run) {
    return "No runs yet";
  }
  const conclusion = run.conclusion ?? run.status;
  return `${run.name} · ${conclusion}`;
}

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}
