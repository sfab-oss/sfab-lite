import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { cn } from "@sfab-lite/ui/lib/utils";
import { useState } from "react";
import type { CheckRunRecord } from "@/hooks/use-prs";
import { useRerun, useRun, useRuns } from "@/hooks/use-prs";

export function AppActionsPage({ appId }: { appId: string }) {
  const runsQuery = useRuns(appId);
  const rerun = useRerun(appId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const runQuery = useRun(appId, selectedId);
  const selected =
    runQuery.data ?? runsQuery.data?.find((r) => r.id === selectedId) ?? null;

  const onRerun = async (runId: string) => {
    try {
      const next = await rerun.mutateAsync(runId);
      setSelectedId(next.id);
      await runsQuery.refetch();
    } catch {
      // mutation error is enough
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="min-h-0 flex-1 overflow-y-auto border-b px-6 py-6 md:border-r md:border-b-0">
        <h2 className="m-0 mb-3 font-semibold text-base">Check runs</h2>
        {runsQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : null}
        {runsQuery.error instanceof Error ? (
          <p className="text-destructive text-sm">{runsQuery.error.message}</p>
        ) : null}
        {runsQuery.data && runsQuery.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No check runs yet.</p>
        ) : null}
        {runsQuery.data && runsQuery.data.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {runsQuery.data.map((run) => (
              <li key={run.id}>
                <button
                  className={cn(
                    "flex w-full flex-wrap items-baseline gap-3 rounded-md px-2 py-2 text-left font-mono text-xs hover:bg-muted",
                    selectedId === run.id ? "bg-muted" : ""
                  )}
                  onClick={() => setSelectedId(run.id)}
                  type="button"
                >
                  <span>{run.name}</span>
                  <span>{run.status}</span>
                  <span>{run.conclusion ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {run.sha.slice(0, 12)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="min-h-0 w-full overflow-y-auto px-6 py-6 md:w-[min(28rem,40%)]">
        <h2 className="m-0 mb-3 font-semibold text-base">Run detail</h2>
        {selectedId && !selected && runQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : null}
        {selectedId ? null : (
          <p className="text-muted-foreground text-sm">
            Select a check run to inspect it.
          </p>
        )}
        {selected ? (
          <RunDetail
            onRerun={onRerun}
            rerunPending={rerun.isPending}
            run={selected}
          />
        ) : null}
      </div>
    </div>
  );
}

function RunDetail({
  run,
  onRerun,
  rerunPending,
}: {
  run: CheckRunRecord;
  onRerun: (runId: string) => void;
  rerunPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="m-0 grid gap-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-24 text-muted-foreground">Name</dt>
          <dd className="m-0 font-mono text-xs">{run.name}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 text-muted-foreground">Status</dt>
          <dd className="m-0">{run.status}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 text-muted-foreground">Conclusion</dt>
          <dd className="m-0">{run.conclusion ?? "—"}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 text-muted-foreground">Sha</dt>
          <dd className="m-0 font-mono text-xs">{run.sha}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-24 text-muted-foreground">Id</dt>
          <dd className="m-0 break-all font-mono text-xs">{run.id}</dd>
        </div>
      </dl>
      {run.detail ? (
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 text-xs">
          {run.detail}
        </pre>
      ) : null}
      <Button
        disabled={rerunPending}
        onClick={() => onRerun(run.id)}
        size="sm"
        type="button"
        variant="outline"
      >
        {rerunPending ? "Rerunning…" : "Rerun"}
      </Button>
    </div>
  );
}
