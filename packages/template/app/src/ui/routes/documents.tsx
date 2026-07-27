import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/badge";
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
import { NativeSelect } from "../components/native-select";
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
import {
  createDocument,
  documentReference,
  documentsQueryOptions,
} from "../lib/documents";
import { entitiesQueryOptions } from "../lib/entities";
import { formatCents } from "../lib/money";

export function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const documents = useQuery(documentsQueryOptions);
  const entities = useQuery(entitiesQueryOptions);
  const [entityId, setEntityId] = useState("");

  const create = useMutation({
    mutationFn: createDocument,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: documentsQueryOptions.queryKey,
      });
      if (result.document) {
        await navigate({
          to: "/documents/$id",
          params: { id: result.document.id },
        });
      }
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const chosen = entityId || entities.data?.[0]?.id;
    if (chosen) {
      create.mutate(chosen);
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
