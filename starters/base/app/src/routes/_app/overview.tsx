import { createFileRoute } from "@tanstack/react-router";
import { ShellPageFrame } from "../../components/layout/shell";
import { EmptyState } from "../../components/ui/empty-state";
import { useSession } from "../../hooks/use-session";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  const session = useSession();
  const orgName = session.data?.organization?.name ?? "your organization";

  return (
    <ShellPageFrame>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-1">
          <h2 className="font-semibold text-2xl tracking-tight">
            Welcome to {orgName}
          </h2>
          <p className="text-muted-foreground text-sm">
            Your app starts here. Add routes and resources as you need them.
          </p>
        </div>
        <EmptyState
          description="No resources yet. Use the agent or open a PR to add your first feature."
          title="Empty home"
        />
      </div>
    </ShellPageFrame>
  );
}
