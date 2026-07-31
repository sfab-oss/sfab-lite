import { useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  documentReference,
  useAddDocumentLine,
  useDeleteDocument,
  useDeleteDocumentLine,
  useDocument,
  useFinalizeDocument,
} from "../hooks/use-documents";
import { useProducts } from "../hooks/use-products";
import { formatCents } from "../lib/money";

export function DocumentDetailPage() {
  const { id } = useParams({ from: "/_app/documents/$id" });
  const navigate = useNavigate();

  const detail = useDocument(id);
  const products = useProducts();

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const addLine = useAddDocumentLine();
  const removeLine = useDeleteDocumentLine();
  const finalize = useFinalizeDocument();
  const discard = useDeleteDocument();

  if (detail.isLoading) {
    return (
      <AppShell title="Document">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!detail.data) {
    return (
      <AppShell title="Document">
        <Alert variant="destructive">
          <AlertTitle>Not found</AlertTitle>
          <AlertDescription>
            This document does not exist, or belongs to another organization.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const { document, lines } = detail.data;
  const isDraft = document.status === "draft";
  const failure = addLine.error ?? finalize.error ?? removeLine.error;

  function onAddLine(event: FormEvent) {
    event.preventDefault();
    const chosen = productId || products.data?.[0]?.id;
    if (chosen) {
      addLine.mutate(
        {
          id,
          productId: chosen,
          quantity: Math.max(1, Number.parseInt(quantity, 10) || 1),
        },
        { onSuccess: () => setQuantity("1") }
      );
    }
  }

  return (
    <AppShell title={documentReference(document)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {document.entityNameSnapshot}
            <Badge variant={isDraft ? "outline" : "default"}>
              {document.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isDraft ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">
                    {line.nameSnapshot}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(line.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(line.quantity * line.unitPriceCents)}
                  </TableCell>
                  {isDraft ? (
                    <TableCell className="text-right">
                      <Button
                        disabled={removeLine.isPending}
                        onClick={() =>
                          removeLine.mutate({ id, lineId: line.id })
                        }
                        type="button"
                        variant="ghost"
                      >
                        Remove
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(document.totalCents)}
                </TableCell>
                {isDraft ? <TableCell /> : null}
              </TableRow>
            </TableFooter>
          </Table>

          {isDraft ? (
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={onAddLine}
            >
              <NativeSelect
                onChange={(event) => setProductId(event.target.value)}
                value={productId || products.data?.[0]?.id || ""}
              >
                {products.data?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.sku} — {option.name}
                  </option>
                ))}
              </NativeSelect>
              <Input
                className="sm:w-24"
                inputMode="numeric"
                onChange={(event) => setQuantity(event.target.value)}
                value={quantity}
              />
              <Button
                disabled={addLine.isPending || !products.data?.length}
                type="submit"
              >
                {addLine.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Add line
              </Button>
            </form>
          ) : null}

          {isDraft && !products.data?.length ? (
            <p className="text-muted-foreground text-sm">
              The catalog is empty — add a product before billing anything.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {failure ? (
        <Alert variant="destructive">
          <AlertTitle>Could not update the document</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}

      {isDraft ? (
        <div className="flex items-center gap-3">
          <Button
            disabled={finalize.isPending}
            onClick={() => finalize.mutate(id)}
            type="button"
          >
            {finalize.isPending ? <Spinner data-icon="inline-start" /> : null}
            Issue document
          </Button>
          <Button
            disabled={discard.isPending}
            onClick={() =>
              discard.mutate(id, {
                onSuccess: async () => {
                  await navigate({ to: "/documents" });
                },
              })
            }
            type="button"
            variant="ghost"
          >
            Discard draft
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Issued documents are records: their lines, prices, and total no longer
          change.
        </p>
      )}
    </AppShell>
  );
}
