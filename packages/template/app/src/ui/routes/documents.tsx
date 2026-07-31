import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/ui/empty";
import { NativeSelect } from "../components/ui/native-select";
import { Skeleton } from "../components/ui/skeleton";
import { Spinner } from "../components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  documentReference,
  useCreateDocument,
  useDocuments,
} from "../hooks/use-documents";
import { useEntities } from "../hooks/use-entities";
import { formatCents } from "../lib/money";

export function DocumentsPage() {
  const navigate = useNavigate();
  const documents = useDocuments();
  const entities = useEntities();
  const [entityId, setEntityId] = useState("");

  const create = useCreateDocument();

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const chosen = entityId || entities.data?.[0]?.id;
    if (chosen) {
      create.mutate(chosen, {
        onSuccess: async (result) => {
          if (result.document) {
            await navigate({
              to: "/documents/$id",
              params: { id: result.document.id },
            });
          }
        },
      });
    }
  }

  const hasEntities = (entities.data?.length ?? 0) > 0;

  return (
    <AppShell title="Documents">
      <Card>
        <CardHeader>
          <CardTitle>New document</CardTitle>
          <CardDescription>
            Starts as a draft; add lines, then issue it
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasEntities ? (
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={onCreate}
            >
              <NativeSelect
                onChange={(event) => setEntityId(event.target.value)}
                value={entityId || entities.data?.[0]?.id || ""}
              >
                {entities.data?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
              <Button disabled={create.isPending} type="submit">
                {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                {create.isPending ? "Creating…" : "New draft"}
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              Add a party first — a document is always raised against one.
            </p>
          )}
        </CardContent>
      </Card>

      {documents.isLoading ? <Skeleton className="h-32 w-full" /> : null}

      {!documents.isLoading && documents.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              Raise a draft above to get started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {documents.data && documents.data.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        params={{ id: row.id }}
                        to="/documents/$id"
                      >
                        {documentReference(row)}
                      </Link>
                    </TableCell>
                    <TableCell>{row.entityNameSnapshot}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "draft" ? "outline" : "default"}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(row.totalCents)}
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
