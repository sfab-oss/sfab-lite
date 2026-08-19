import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CreateInvoiceDialog } from "../../../components/invoices/create-invoice-dialog";
import { ShellPageFrame } from "../../../components/layout/shell";
import { Badge } from "../../../components/ui/badge";
import { EmptyState } from "../../../components/ui/empty-state";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { useInvoices } from "../../../hooks/use-invoices";
import { INVOICE_STATUS_LABEL } from "../../../lib/invoice-status";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const invoices = useInvoices();
  const rows = invoices.data ?? [];
  const empty = !invoices.isLoading && rows.length === 0;

  let body: ReactNode;
  if (invoices.isLoading) {
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
          description="Create an invoice against a customer party."
          title="No invoices yet"
        />
      </div>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Memo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    className="transition-colors hover:text-primary hover:underline"
                    params={{ id: row.id }}
                    to="/invoices/$id"
                  >
                    {row.partyName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {INVOICE_STATUS_LABEL[row.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.memo ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <ShellPageFrame
      actions={<CreateInvoiceDialog />}
      items={[{ title: "Invoices" }]}
    >
      {body}
    </ShellPageFrame>
  );
}
