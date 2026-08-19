import { createFileRoute } from "@tanstack/react-router";
import { AddInvoiceLineDialog } from "../../../components/invoices/add-invoice-line-dialog";
import { ShellPageFrame } from "../../../components/layout/shell";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { EmptyState } from "../../../components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  useAddInvoiceLine,
  useInvoice,
  useUpdateInvoice,
} from "../../../hooks/use-invoices";
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUSES,
} from "../../../lib/invoice-status";
import { formatCents } from "../../../lib/money";

export const Route = createFileRoute("/_app/invoices/$id")({
  component: InvoiceDetailPage,
});

const STATUS_ITEMS = INVOICE_STATUSES.map((status) => ({
  value: status,
  label: INVOICE_STATUS_LABEL[status],
}));

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const detail = useInvoice(id);
  const update = useUpdateInvoice(id);
  const addLine = useAddInvoiceLine(id);

  const invoice =
    detail.data && "invoice" in detail.data ? detail.data.invoice : null;
  const lines = detail.data && "lines" in detail.data ? detail.data.lines : [];

  const crumbs = [{ title: "Invoices", to: "/invoices" as const }];

  if (detail.isLoading) {
    return (
      <ShellPageFrame items={crumbs}>
        <div className="grid gap-6 p-6 lg:grid-cols-3">
          <Skeleton className="h-48 lg:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </ShellPageFrame>
    );
  }

  if (detail.error) {
    return (
      <ShellPageFrame items={crumbs}>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>{detail.error.message}</AlertDescription>
          </Alert>
        </div>
      </ShellPageFrame>
    );
  }

  if (!invoice) {
    return (
      <ShellPageFrame items={crumbs}>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState title="Invoice not found" />
        </div>
      </ShellPageFrame>
    );
  }

  const totalCents = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceCents,
    0
  );

  return (
    <ShellPageFrame items={[...crumbs, { title: invoice.partyName }]}>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{invoice.partyName}</CardTitle>
                <Badge variant="secondary">
                  {INVOICE_STATUS_LABEL[invoice.status]}
                </Badge>
              </div>
              <CardDescription>{invoice.memo ?? "No memo"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-muted-foreground text-xs">Total</p>
                <p className="font-bold text-2xl tabular-nums">
                  {formatCents(totalCents)}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44 space-y-1.5">
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Select
                    items={STATUS_ITEMS}
                    onValueChange={(status) => {
                      if (status == null || status === invoice.status) {
                        return;
                      }
                      update.mutate({ status });
                    }}
                    value={invoice.status}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <AddInvoiceLineDialog
                  onSubmit={(input, close) =>
                    addLine.mutate(input, { onSuccess: close })
                  }
                  pending={addLine.isPending}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lines</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <EmptyState title="No lines yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit</TableHead>
                      <TableHead className="text-right">Line</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.itemName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(row.unitPriceCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(row.quantity * row.unitPriceCents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ShellPageFrame>
  );
}
