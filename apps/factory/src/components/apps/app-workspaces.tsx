import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { Link } from "@tanstack/react-router";
import { useWorkspaces } from "@/hooks/query/use-workspaces";

export function AppWorkspacesPage({ appId }: { appId: string }) {
  const query = useWorkspaces(appId);
  const workspaces = query.data ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <h1 className="m-0 font-semibold text-xl tracking-tight">
            Workspaces
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Isolated work environments for this app.
          </p>
        </div>

        {query.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {query.error instanceof Error ? (
          <p className="text-destructive text-sm">{query.error.message}</p>
        ) : null}

        {query.isSuccess ? (
          <ul className="m-0 list-none divide-y border-border border-y p-0">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  className="flex items-center justify-between gap-3 py-3 text-sm no-underline hover:bg-muted/40"
                  params={{ appId, workspaceId: workspace.id }}
                  to="/apps/$appId/workspaces/$workspaceId/work"
                >
                  <span className="font-medium text-foreground">
                    {workspace.name}
                    {workspace.isDefault ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-muted-foreground text-xs">
                    {workspace.id}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
