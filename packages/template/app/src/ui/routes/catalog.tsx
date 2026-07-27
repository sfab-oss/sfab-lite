import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../components/alert";
import { AppShell } from "../components/app-shell";
import { Button } from "../components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/empty";
import { Input } from "../components/input";
import { Skeleton } from "../components/skeleton";
import { Spinner } from "../components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/table";
import { formatCents, parseCents } from "../lib/money";
import {
  createProduct,
  deleteProduct,
  productsQueryOptions,
} from "../lib/products";

const BLANK = { sku: "", name: "", price: "" };

export function CatalogPage() {
  const queryClient = useQueryClient();
  const products = useQuery(productsQueryOptions);
  const [form, setForm] = useState(BLANK);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: productsQueryOptions.queryKey });

  const create = useMutation({
    mutationFn: createProduct,
    onSuccess: async () => {
      setForm(BLANK);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: deleteProduct,
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      sku: form.sku,
      name: form.name,
      unitPriceCents: parseCents(form.price),
    });
  }

  return (
    <AppShell title="Catalog">
      <Card>
        <CardHeader>
          <CardTitle>New product</CardTitle>
          <CardDescription>What a document line can quote</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onCreate}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                className="sm:w-40"
                onChange={(event) =>
                  setForm({ ...form, sku: event.target.value })
                }
                placeholder="SKU"
                required
                value={form.sku}
              />
              <Input
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Name"
                required
                value={form.name}
              />
              <Input
                className="sm:w-32"
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
                placeholder="0.00"
                value={form.price}
              />
            </div>
            <Button
              disabled={
                create.isPending || !(form.sku.trim() && form.name.trim())
              }
              type="submit"
            >
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {create.isPending ? "Saving…" : "Add product"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {create.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not add product</AlertTitle>
          <AlertDescription>{create.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {products.isLoading ? <Skeleton className="h-32 w-full" /> : null}

      {!products.isLoading && products.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing in the catalog</EmptyTitle>
            <EmptyDescription>
              Add a product above so document lines have something to quote.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {products.data && products.data.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {row.sku}
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(row.unitPriceCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(row.id)}
                        type="button"
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    </TableCell>
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
