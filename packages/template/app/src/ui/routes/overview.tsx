import { CubeIcon, FileTextIcon, PersonIcon } from "@radix-ui/react-icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import { sessionQueryOptions } from "../lib/session";

const SECTIONS = [
  {
    to: "/documents",
    title: "Documents",
    description: "Invoices built from parties and catalog lines.",
    icon: FileTextIcon,
  },
  {
    to: "/entities",
    title: "Parties",
    description: "The customers and vendors this organization trades with.",
    icon: PersonIcon,
  },
  {
    to: "/catalog",
    title: "Catalog",
    description: "Products with a SKU and a unit price.",
    icon: CubeIcon,
  },
] as const;

/**
 * Deliberately ships no metrics. A landing page that invents numbers teaches
 * the wrong thing about what this app actually stores; pointing at the real
 * sections does not.
 */
export function OverviewPage() {
  const session = useQuery(sessionQueryOptions);
  const orgName = session.data?.organization?.name ?? "your organization";

  return (
    <AppShell title="Overview">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-2xl tracking-tight">Welcome back</h2>
        <p className="text-muted-foreground text-sm">
          You are working in {orgName}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link className="group" key={section.to} to={section.to}>
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <section.icon className="mb-2 size-5 text-muted-foreground" />
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
