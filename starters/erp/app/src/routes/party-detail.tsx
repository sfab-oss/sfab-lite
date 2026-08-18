import { TrashIcon } from "@radix-ui/react-icons";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { AppBreadcrumbs } from "../components/layout/app-breadcrumbs";
import {
  ShellContent,
  ShellHeader,
  ShellHeaderActions,
  ShellHeaderSidebarTrigger,
  ShellPage,
} from "../components/layout/shell";
import { DeletePartyDialog } from "../components/parties/delete-party-dialog";
import { LedgerDialog } from "../components/parties/ledger-dialog";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
import {
  useAddCharge,
  useAddPayment,
  useDeleteParty,
  useParty,
} from "../hooks/use-parties";
import { formatCents } from "../lib/money";
import { PARTY_KIND_LABEL } from "../lib/party-kind";

export function PartyDetailPage() {
  const { id } = useParams({ from: "/_app/parties/$id" });
  const navigate = useNavigate();
  const detail = useParty(id);
  const charge = useAddCharge(id);
  const payment = useAddPayment(id);
  const remove = useDeleteParty();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const party =
    detail.data && "party" in detail.data ? detail.data.party : null;
  const entries =
    detail.data && "entries" in detail.data ? detail.data.entries : [];
  const balanceCents =
    detail.data && "balanceCents" in detail.data ? detail.data.balanceCents : 0;

  if (detail.isLoading) {
    return (
      <ShellPage>
        <ShellHeader>
          <ShellHeaderSidebarTrigger className="-ml-1" />
          <AppBreadcrumbs items={[{ title: "Parties", to: "/parties" }]} />
          <ShellHeaderActions />
        </ShellHeader>
        <ShellContent>
          <div className="grid gap-6 p-6 lg:grid-cols-3">
            <Skeleton className="h-48 lg:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </ShellContent>
      </ShellPage>
    );
  }

  if (detail.error) {
    return (
      <ShellPage>
        <ShellHeader>
          <ShellHeaderSidebarTrigger className="-ml-1" />
          <AppBreadcrumbs items={[{ title: "Parties", to: "/parties" }]} />
          <ShellHeaderActions />
        </ShellHeader>
        <ShellContent>
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>{detail.error.message}</AlertDescription>
            </Alert>
          </div>
        </ShellContent>
      </ShellPage>
    );
  }

  if (!party) {
    return (
      <ShellPage>
        <ShellHeader>
          <ShellHeaderSidebarTrigger className="-ml-1" />
          <AppBreadcrumbs items={[{ title: "Parties", to: "/parties" }]} />
          <ShellHeaderActions />
        </ShellHeader>
        <ShellContent>
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="Party not found" />
          </div>
        </ShellContent>
      </ShellPage>
    );
  }

  return (
    <ShellPage>
      <ShellHeader>
        <ShellHeaderSidebarTrigger className="-ml-1" />
        <AppBreadcrumbs
          items={[{ title: "Parties", to: "/parties" }, { title: party.name }]}
        />
        <ShellHeaderActions>
          <Button
            aria-label="Delete party"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <TrashIcon className="size-4" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </ShellHeaderActions>
      </ShellHeader>
      <ShellContent>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{party.name}</CardTitle>
                  <Badge variant="secondary">
                    {PARTY_KIND_LABEL[party.kind]}
                  </Badge>
                </div>
                <CardDescription>
                  {party.email ?? "No email"}
                  {party.taxId ? ` · ${party.taxId}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-muted-foreground text-xs">
                    Running balance
                  </p>
                  <p className="font-bold text-2xl tabular-nums">
                    {formatCents(balanceCents)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LedgerDialog
                    description="Increases what they owe"
                    onSubmit={(input, close) =>
                      charge.mutate(input, { onSuccess: close })
                    }
                    pending={charge.isPending}
                    submitLabel="Record charge"
                    title="Charge"
                  />
                  <LedgerDialog
                    description="Decreases what they owe"
                    onSubmit={(input, close) =>
                      payment.mutate(input, { onSuccess: close })
                    }
                    pending={payment.isPending}
                    submitLabel="Record payment"
                    title="Payment"
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ledger</CardTitle>
              </CardHeader>
              <CardContent>
                {entries.length === 0 ? (
                  <EmptyState title="No lines yet" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kind</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Memo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="capitalize">
                            {row.kind}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCents(row.amountCents)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.memo ?? "—"}
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
      </ShellContent>
      <DeletePartyDialog
        error={remove.error?.message ?? null}
        onConfirm={() => {
          remove.mutate(id, {
            onSuccess: async () => {
              setDeleteOpen(false);
              await navigate({ to: "/parties" });
            },
          });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        partyName={party.name}
        pending={remove.isPending}
      />
    </ShellPage>
  );
}
