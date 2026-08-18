import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShellPageFrame } from "../components/layout/shell";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useOpenBalances } from "../hooks/use-parties";
import { formatCents } from "../lib/money";
import { PARTY_KIND_LABEL } from "../lib/party-kind";

export function BalancesPage() {
  const balances = useOpenBalances();
  const rows = balances.data ?? [];
  const empty = !balances.isLoading && rows.length === 0;

  let body: ReactNode;
  if (balances.isLoading) {
    body = (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (empty) {
    body = (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          description="Everyone is settled."
          title="No open balances"
        />
      </div>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    className="transition-colors hover:text-primary hover:underline"
                    params={{ id: row.id }}
                    to="/parties/$id"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {PARTY_KIND_LABEL[row.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCents(row.balanceCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <ShellPageFrame items={[{ title: "Open balances" }]}>{body}</ShellPageFrame>
  );
}
