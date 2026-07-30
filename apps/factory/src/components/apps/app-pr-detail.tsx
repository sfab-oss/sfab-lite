import { MultiFileDiff } from "@pierre/diffs/react";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { CheckRunRecord, PrDiffFile, PrRecord } from "@/hooks/use-prs";
import { useMergePr, usePr, usePrDiff, useRerun } from "@/hooks/use-prs";
import { appPrPreviewBasePath } from "@/lib/preview/reload-preview";

const PIERRE_THEME = {
  dark: "pierre-dark" as const,
  light: "pierre-light" as const,
};

export function AppPrDetailPage({
  appId,
  prNumber,
}: {
  appId: string;
  prNumber: number;
}) {
  const prQuery = usePr(appId, prNumber);
  const diffQuery = usePrDiff(appId, prNumber);
  const mergePr = useMergePr(appId, prNumber);
  const rerun = useRerun(appId);
  const [mergeError, setMergeError] = useState<string | null>(null);
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
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link
          className="text-muted-foreground no-underline hover:underline"
          params={{ appId }}
          to="/apps/$appId/prs"
        >
          Pull requests
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono">#{prNumber}</span>
      </div>

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
          baseSha={diffQuery.data?.baseSha ?? null}
          checks={checks}
          diffError={
            diffQuery.error instanceof Error ? diffQuery.error.message : null
          }
          diffFiles={diffQuery.data?.files ?? []}
          diffPending={diffQuery.isPending}
          headSha={diffQuery.data?.headSha ?? pr.headSha}
          mergeError={mergeError}
          mergePending={mergePr.isPending}
          onMerge={onMerge}
          onRerun={onRerun}
          pr={pr}
          rerunPending={rerun.isPending}
        />
      ) : null}
    </div>
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
  diffFiles,
  diffPending,
  diffError,
  baseSha,
  headSha,
}: {
  appId: string;
  pr: PrRecord;
  checks: CheckRunRecord[];
  mergePending: boolean;
  mergeError: string | null;
  onMerge: () => void;
  onRerun: (runId: string) => void;
  rerunPending: boolean;
  diffFiles: PrDiffFile[];
  diffPending: boolean;
  diffError: string | null;
  baseSha: string | null;
  headSha: string;
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
          {pr.status === "open" && pr.previewSha ? (
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
        <h2 className="m-0 mb-2 font-semibold text-base">Files changed</h2>
        {diffPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
        {diffError ? (
          <p className="text-destructive text-sm">{diffError}</p>
        ) : null}
        {!(diffPending || diffError) && diffFiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">No file changes.</p>
        ) : null}
        {diffFiles.length > 0 ? (
          <div className="flex flex-col gap-4">
            {diffFiles.map((file) => (
              <PrFileDiff
                baseSha={baseSha}
                file={file}
                headSha={headSha}
                key={file.path}
              />
            ))}
          </div>
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

function PrFileDiff({
  file,
  baseSha,
  headSha,
}: {
  file: PrDiffFile;
  baseSha: string | null;
  headSha: string;
}) {
  const name = file.path.includes("/")
    ? file.path.slice(file.path.lastIndexOf("/") + 1)
    : file.path;
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="border-b px-3 py-2 font-mono text-xs">{file.path}</div>
      <MultiFileDiff
        disableWorkerPool
        newFile={{
          name,
          contents: file.after ?? "",
          cacheKey: `${headSha}:${file.path}:after`,
        }}
        oldFile={{
          name,
          contents: file.before ?? "",
          cacheKey: `${baseSha ?? "none"}:${file.path}:before`,
        }}
        options={{
          theme: PIERRE_THEME,
          diffStyle: "unified",
          overflow: "scroll",
          disableFileHeader: true,
        }}
      />
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
