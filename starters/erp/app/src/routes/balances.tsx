import { Link } from "@tanstack/react-router";
import { AppShell } from "../components/layout/app-shell";
import { Card, CardContent } from "../components/ui/card";
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

export function BalancesPage() {
  const balances = useOpenBalances();

  return (
    <AppShell title="Open balances">
      {balances.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}

      {!balances.isLoading && balances.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No open balances. Everyone is settled.
        </p>
      ) : null}

      {balances.data && balances.data.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <Link
                        className="underline underline-offset-4"
                        params={{ id: row.id }}
                        to="/parties/$id"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.kind}
                    </TableCell>
                    <TableCell>{formatCents(row.balanceCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
