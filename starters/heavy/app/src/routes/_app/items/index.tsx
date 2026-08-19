import { TrashIcon } from "@radix-ui/react-icons";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { CreateItemDialog } from "../../../components/items/create-item-dialog";
import { DeleteItemDialog } from "../../../components/items/delete-item-dialog";
import { ShellPageFrame } from "../../../components/layout/shell";
import { Button } from "../../../components/ui/button";
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
import { useDeleteItem, useItems } from "../../../hooks/use-items";
import { formatCents } from "../../../lib/money";

export const Route = createFileRoute("/_app/items/")({
  component: ItemsPage,
});

function ItemsPage() {
  const items = useItems();
  const remove = useDeleteItem();
  const rows = items.data ?? [];
  const empty = !items.isLoading && rows.length === 0;
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  let body: ReactNode;
  if (items.isLoading) {
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
          description="Create a catalog item to put on invoices."
          title="No items yet"
        />
      </div>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.sku ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCents(row.unitPriceCents)}
                </TableCell>
                <TableCell>
                  <Button
                    aria-label={`Delete ${row.name}`}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setPendingDelete({ id: row.id, name: row.name })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <ShellPageFrame actions={<CreateItemDialog />} items={[{ title: "Items" }]}>
      {body}
      <DeleteItemDialog
        error={remove.error?.message ?? null}
        itemName={pendingDelete?.name ?? ""}
        onConfirm={() => {
          if (!pendingDelete) {
            return;
          }
          remove.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          });
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete != null}
        pending={remove.isPending}
      />
    </ShellPageFrame>
  );
}
