import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useSession } from "../hooks/use-session";

const SECTIONS = [
  {
    to: "/parties",
    title: "Parties",
    description: "Customers and vendors, with a running balance.",
  },
  {
    to: "/balances",
    title: "Open balances",
    description: "Everyone who still owes, or is owed.",
  },
] as const;

export function OverviewPage() {
  const session = useSession();
  const orgName = session.data?.organization?.name ?? "your organization";

  return (
    <AppShell title="Overview">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-2xl tracking-tight">
          Welcome to {orgName}
        </h2>
        <p className="text-muted-foreground text-sm">
          You are working in {orgName}.
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
    </AppShell>
  );
}
