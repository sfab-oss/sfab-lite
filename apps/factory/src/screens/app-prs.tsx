import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { PrRecord } from "../api";
import { AppLayoutHeader } from "../components/brand/app-layout";
import { useApp } from "../hooks/use-apps";
import { useCreatePr, usePrs, useRuns } from "../hooks/use-prs";

export function AppPrsScreen({ appId }: { appId: string }) {
  const navigate = useNavigate();
  const appQuery = useApp(appId);
  const prsQuery = usePrs(appId);
  const runsQuery = useRuns(appId);
  const createPr = useCreatePr(appId);
  const app = appQuery.data ?? null;
  const [title, setTitle] = useState("");
  const [headBranch, setHeadBranch] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await createPr.mutateAsync({
        title: title.trim(),
        headBranch: headBranch.trim(),
        body: body.trim() || undefined,
      });
      setTitle("");
      setHeadBranch("");
      setBody("");
      await navigate({
        to: "/apps/$appId/prs/$prNumber",
        params: { appId, prNumber: String(result.pr.number) },
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
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
          <span className="shrink-0 text-sm">Pull requests</span>
        </div>
      </AppLayoutHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <section className="mb-8">
          <h2 className="m-0 mb-3 font-semibold text-base">Open a PR</h2>
          <form className="flex max-w-lg flex-col gap-3" onSubmit={onCreate}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Title</span>
              <input
                className="rounded-md border border-border bg-background px-3 py-2"
                onChange={(e) => setTitle(e.target.value)}
                required
                value={title}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Head branch</span>
              <input
                className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                onChange={(e) => setHeadBranch(e.target.value)}
                placeholder="feat/…"
                required
                value={headBranch}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Body (optional)</span>
              <textarea
                className="min-h-20 rounded-md border border-border bg-background px-3 py-2"
                onChange={(e) => setBody(e.target.value)}
                value={body}
              />
            </label>
            {formError ? (
              <p className="m-0 text-destructive text-sm">{formError}</p>
            ) : null}
            <Button disabled={createPr.isPending} type="submit">
              {createPr.isPending ? "Creating…" : "Create pull request"}
            </Button>
          </form>
        </section>

        <section>
          <h2 className="m-0 mb-3 font-semibold text-base">Pull requests</h2>
          {prsQuery.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : null}
          {prsQuery.error instanceof Error ? (
            <p className="text-destructive">{prsQuery.error.message}</p>
          ) : null}
          {prsQuery.data && prsQuery.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No pull requests yet.
            </p>
          ) : null}
          {prsQuery.data && prsQuery.data.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {prsQuery.data.map((pr) => (
                <PrRow appId={appId} key={pr.id} pr={pr} />
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="m-0 mb-3 font-semibold text-base">
            Recent check runs
          </h2>
          {runsQuery.data && runsQuery.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">No check runs yet.</p>
          ) : null}
          {runsQuery.data && runsQuery.data.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-xs">
              {runsQuery.data.map((run) => (
                <li className="flex flex-wrap gap-3" key={run.id}>
                  <span>{run.name}</span>
                  <span>{run.status}</span>
                  <span>{run.conclusion ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {run.sha.slice(0, 12)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </>
  );
}

function PrRow({ appId, pr }: { appId: string; pr: PrRecord }) {
  return (
    <li className="flex items-baseline gap-3 text-sm">
      <Link
        className="font-mono text-xs no-underline hover:underline"
        params={{ appId, prNumber: String(pr.number) }}
        to="/apps/$appId/prs/$prNumber"
      >
        #{pr.number}
      </Link>
      <span className="text-muted-foreground">{pr.status}</span>
      <Link
        className="truncate no-underline hover:underline"
        params={{ appId, prNumber: String(pr.number) }}
        to="/apps/$appId/prs/$prNumber"
      >
        {pr.title}
      </Link>
      <span className="shrink-0 font-mono text-muted-foreground text-xs">
        {pr.headBranch}
      </span>
    </li>
  );
}
