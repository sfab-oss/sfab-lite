import { createFileRoute, Link } from "@tanstack/react-router";
import { ShellPageFrame } from "../../components/layout/shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useSession } from "../../hooks/use-session";

export const Route = createFileRoute("/_app/overview")({
  component: OverviewPage,
});

const SECTIONS = [
  {
    to: "/parties" as const,
    title: "Parties",
    description: "Customers and vendors, with a running balance.",
  },
  {
    to: "/balances" as const,
    title: "Open balances",
    description: "Everyone who still owes, or is owed.",
  },
];

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
            Parties and their ledgers live here.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link className="group" key={section.to} to={section.to}>
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ShellPageFrame>
  );
}
