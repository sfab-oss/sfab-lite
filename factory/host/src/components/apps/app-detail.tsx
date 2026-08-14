import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { cn } from "@sfab-lite/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useApp, useAppAttempt } from "@/hooks/query/use-apps";
import { usePrs, useRuns } from "@/hooks/query/use-prs";
import { useDefaultWorkspace } from "@/hooks/query/use-workspaces";
import type { AppRecord, AttemptRecord } from "@/lib/api/apps";
import type { CheckRunRecord, PrRecord } from "@/lib/api/prs";
import { appBasePath } from "@/lib/preview/reload-preview";
import { StatusBadge } from "./status-badge";

const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";

export function AppDetailPage({ appId }: { appId: string }) {
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
        <div className="flex max-w-5xl flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Skeleton className="aspect-[16/10] w-full rounded-lg" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="mt-4 h-9 w-24" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
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
  const liveHref = `${appBasePath(app.id)}/`;
  const canVisit = app.status === "ready" && Boolean(app.liveSha);
  const shortSha = app.liveSha ? app.liveSha.slice(0, 12) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <section className="grid gap-6 border-border border-b pb-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-stretch">
        <LivePreviewPane
          appId={app.id}
          canVisit={canVisit}
          href={liveHref}
          status={app.status}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusDot status={app.status} />
            <h1 className="m-0 font-semibold text-xl tracking-tight">
              {app.name}
            </h1>
            <StatusBadge status={app.status} />
          </div>

          {app.status === "creating" ? (
            <p className="m-0 text-muted-foreground text-sm">
              Initializing the repo and running the first deployment…
            </p>
          ) : null}

          {app.status === "failed" ? (
            <p className="m-0 text-destructive text-sm">
              Create failed. See details below.
            </p>
          ) : null}

          {canVisit ? (
            <dl className="m-0 grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Domains
                </dt>
                <dd className="m-0 mt-1">
                  <a
                    className="break-all font-mono text-foreground text-xs no-underline hover:underline"
                    href={liveHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {liveHref}
                  </a>
                </dd>
              </div>
              {shortSha ? (
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Deployment
                  </dt>
                  <dd className="m-0 mt-1 font-mono text-xs">{shortSha}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {canVisit ? (
              <Button
                render={<a href={liveHref} rel="noreferrer" target="_blank" />}
              >
                Visit
                <ExternalLink className="size-3.5 opacity-70" />
              </Button>
            ) : null}
            <OpenWorkspaceButton appId={app.id} />
            <Button
              render={
                <Link
                  params={{ appId: app.id }}
                  to="/apps/$appId/deployments"
                />
              }
              variant="outline"
            >
              Deployments
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-x-6 gap-y-4 border-border border-b py-5 md:grid-cols-4">
        <MetaCell label="Commit">
          {shortSha ? (
            <Link
              className="font-mono text-foreground text-xs no-underline hover:underline"
              params={{ appId: app.id }}
              to="/apps/$appId/code"
            >
              {shortSha}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </MetaCell>
        <MetaCell label="Branch">
          <span className="font-mono text-xs">main</span>
        </MetaCell>
        <MetaCell label="Created">
          <time dateTime={app.createdAt}>{formatWhen(app.createdAt)}</time>
        </MetaCell>
        <MetaCell label="Updated">
          <time dateTime={app.updatedAt}>{formatWhen(app.updatedAt)}</time>
        </MetaCell>
      </section>

      <section className="grid gap-3 border-border border-b py-6 sm:grid-cols-2">
        <Link
          className="rounded-lg border border-border px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/40"
          params={{ appId: app.id }}
          to="/apps/$appId/prs"
        >
          <p className="m-0 font-medium text-sm">Open pull requests</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {prsPulseLabel(openPrs.length)}
          </p>
        </Link>
        <Link
          className="rounded-lg border border-border px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/40"
          params={{ appId: app.id }}
          to="/apps/$appId/actions"
        >
          <p className="m-0 font-medium text-sm">Latest check</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {latestRunPulse(latestRun)}
          </p>
        </Link>
      </section>

      <AttemptSection app={app} attempt={attempt} />

      {app.status === "failed" && !app.createAttemptId ? (
        <p className="mt-6 text-destructive text-sm">
          Create failed during bootstrap (no job id).
        </p>
      ) : null}
    </div>
  );
}

function OpenWorkspaceButton({ appId }: { appId: string }) {
  const defaultQuery = useDefaultWorkspace(appId);
  const workspaceId = defaultQuery.data?.id;
  if (!workspaceId) {
    return (
      <Button disabled variant="outline">
        Open workspace
      </Button>
    );
  }
  return (
    <Button
      render={
        <Link
          params={{ appId, workspaceId }}
          to="/apps/$appId/workspaces/$workspaceId/work"
        />
      }
      variant="outline"
    >
      Open workspace
    </Button>
  );
}

function LivePreviewPane({
  appId,
  canVisit,
  href,
  status,
}: {
  appId: string;
  canVisit: boolean;
  href: string;
  status: AppRecord["status"];
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="aspect-[16/10] w-full">
        {canVisit ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <iframe
              className="absolute top-0 left-0 h-[200%] w-[200%] origin-top-left scale-50 border-0 bg-background"
              sandbox={IFRAME_SANDBOX}
              src={`${appBasePath(appId)}/`}
              title={`${appId} live preview`}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="m-0 text-muted-foreground text-sm">
              {status === "creating"
                ? "Preview will appear when the first deployment is ready"
                : "No live deployment yet"}
            </p>
          </div>
        )}
      </div>
      {canVisit ? (
        <a
          className="absolute inset-0 z-10"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="sr-only">Open live deployment</span>
        </a>
      ) : null}
    </div>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <div className="mt-1 truncate text-sm">{children}</div>
    </div>
  );
}

function StatusDot({ status }: { status: AppRecord["status"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        status === "ready" && "bg-emerald-500",
        status === "creating" && "bg-amber-500",
        status === "failed" && "bg-destructive"
      )}
    />
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
    <section className="py-6">
      <h2 className="m-0 mb-3 font-medium text-sm">Create job</h2>
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

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
