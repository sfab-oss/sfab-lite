import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { CheckRunRecord, PrRecord } from "../api";
import { AppLayoutHeader } from "../components/brand/app-layout";
import { appPrPreviewBasePath } from "../features/preview/reload-preview";
import { useApp } from "../hooks/use-apps";
import { useMergePr, usePr, useRerun } from "../hooks/use-prs";

export function AppPrDetailScreen({
  appId,
  prNumber,
}: {
  appId: string;
  prNumber: number;
}) {
  const appQuery = useApp(appId);
  const prQuery = usePr(appId, prNumber);
  const mergePr = useMergePr(appId, prNumber);
  const rerun = useRerun(appId);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const app = appQuery.data ?? null;
  const pr = prQuery.data?.pr ?? null;
  const checks = prQuery.data?.checks ?? [];

  const onMerge = async () => {
    setMergeError(null);
    try {
      await mergePr.mutateAsync();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRerun = async (runId: string) => {
    try {
      await rerun.mutateAsync(runId);
      await prQuery.refetch();
    } catch {
      // mutation error surface is enough for now
    }
  };

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
          <Link
            className="truncate font-medium text-sm no-underline hover:underline"
            params={{ appId }}
            to="/apps/$appId"
          >
            {app?.name ?? "App"}
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <Link
            className="shrink-0 text-muted-foreground text-sm no-underline hover:underline"
            params={{ appId }}
            to="/apps/$appId/prs"
          >
            PRs
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="shrink-0 font-mono text-sm">#{prNumber}</span>
        </div>
      </AppLayoutHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {prQuery.isPending && !pr ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : null}

        {prQuery.error instanceof Error ? (
          <p className="text-destructive">{prQuery.error.message}</p>
        ) : null}

        {pr ? (
          <PrBody
            appId={appId}
            checks={checks}
            mergeError={mergeError}
            mergePending={mergePr.isPending}
            onMerge={onMerge}
            onRerun={onRerun}
            pr={pr}
            rerunPending={rerun.isPending}
          />
        ) : null}
      </div>
    </>
  );
}

function PrBody({
  appId,
  pr,
  checks,
  mergePending,
  mergeError,
  onMerge,
  onRerun,
  rerunPending,
}: {
  appId: string;
  pr: PrRecord;
  checks: CheckRunRecord[];
  mergePending: boolean;
  mergeError: string | null;
  onMerge: () => void;
  onRerun: (runId: string) => void;
  rerunPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="m-0 mb-3 font-semibold text-lg">{pr.title}</h1>
        <dl className="m-0 grid gap-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Status</dt>
            <dd className="m-0">{pr.status}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Head</dt>
            <dd className="m-0 font-mono text-xs">
              {pr.headBranch} ({pr.headSha.slice(0, 12)})
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Base</dt>
            <dd className="m-0 font-mono text-xs">{pr.baseBranch}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-28 text-muted-foreground">Preview sha</dt>
            <dd className="m-0 font-mono text-xs">
              {pr.previewSha ? pr.previewSha.slice(0, 12) : "—"}
            </dd>
          </div>
        </dl>
        {pr.body ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-sm">
            {pr.body}
          </pre>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {pr.previewSha ? (
            <Button
              render={
                <a
                  href={`${appPrPreviewBasePath(appId, pr.number)}/`}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              variant="outline"
            >
              Open preview
            </Button>
          ) : null}
          {pr.status === "open" ? (
            <Button disabled={mergePending} onClick={onMerge} type="button">
              {mergePending ? "Merging…" : "Merge pull request"}
            </Button>
          ) : null}
        </div>
        {mergeError ? (
          <p className="mt-2 text-destructive text-sm">{mergeError}</p>
        ) : null}
      </section>

      <section>
        <h2 className="m-0 mb-2 font-semibold text-base">Checks</h2>
        {checks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No check runs.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {checks.map((run) => (
              <CheckRow
                key={run.id}
                onRerun={onRerun}
                rerunPending={rerunPending}
                run={run}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CheckRow({
  run,
  onRerun,
  rerunPending,
}: {
  run: CheckRunRecord;
  onRerun: (runId: string) => void;
  rerunPending: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-3 font-mono text-xs">
      <span>{run.name}</span>
      <span>{run.status}</span>
      <span>{run.conclusion ?? "—"}</span>
      <span className="text-muted-foreground">{run.sha.slice(0, 12)}</span>
      <span className="text-muted-foreground">{run.id}</span>
      <Button
        className="h-6 px-2 text-xs"
        disabled={rerunPending}
        onClick={() => onRerun(run.id)}
        size="sm"
        type="button"
        variant="ghost"
      >
        Rerun
      </Button>
    </li>
  );
}
