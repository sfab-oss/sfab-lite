import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/hooks/use-apps";
import type { PrRecord } from "@/hooks/use-prs";
import { usePrs } from "@/hooks/use-prs";
import {
  appBasePath,
  appPrPreviewBasePath,
} from "@/lib/preview/reload-preview";

export function AppDeploymentsPage({ appId }: { appId: string }) {
  const appQuery = useApp(appId);
  const prsQuery = usePrs(appId);
  const app = appQuery.data ?? null;
  const previews = (prsQuery.data ?? []).filter(
    (pr): pr is PrRecord & { previewSha: string } =>
      pr.status === "open" && Boolean(pr.previewSha)
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="flex max-w-2xl flex-col gap-8">
        <section>
          <h2 className="m-0 mb-3 font-semibold text-base">Production</h2>
          {appQuery.isPending && !app ? (
            <Skeleton className="h-16 w-full" />
          ) : null}
          {app ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
              <span className="font-mono text-xs">
                {app.liveSha ? app.liveSha.slice(0, 12) : "No live deployment"}
              </span>
              {app.liveSha ? (
                <Button
                  render={
                    <a
                      href={`${appBasePath(app.id)}/`}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  Open live
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="m-0 mb-3 font-semibold text-base">Previews</h2>
          {prsQuery.isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}
          {previews.length === 0 && !prsQuery.isPending ? (
            <p className="m-0 text-muted-foreground text-sm">
              No preview deployments yet.
            </p>
          ) : null}
          {previews.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {previews.map((pr) => (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                  key={pr.id}
                >
                  <Link
                    className="font-mono text-xs no-underline hover:underline"
                    params={{ appId, prNumber: String(pr.number) }}
                    to="/apps/$appId/prs/$prNumber"
                  >
                    #{pr.number}
                  </Link>
                  <span className="truncate">{pr.title}</span>
                  <span className="font-mono text-muted-foreground text-xs">
                    {pr.previewSha.slice(0, 12)}
                  </span>
                  <Button
                    render={
                      <a
                        href={`${appPrPreviewBasePath(appId, pr.number)}/`}
                        rel="noreferrer"
                        target="_blank"
                      />
                    }
                    size="sm"
                    variant="outline"
                  >
                    Open preview
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
