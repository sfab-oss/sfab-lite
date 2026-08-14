import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
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
import { Input } from "../components/ui/input";
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
  type EntityKind,
  useCreateEntity,
  useDeleteEntity,
  useEntities,
} from "../hooks/use-entities";

const BLANK = {
  name: "",
  kind: "customer" as EntityKind,
  email: "",
  taxId: "",
};

export function EntitiesPage() {
  const entities = useEntities();
  const [form, setForm] = useState(BLANK);

  const create = useCreateEntity();
  const remove = useDeleteEntity();

  function onCreate(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      {
        name: form.name,
        kind: form.kind,
        email: form.email.trim() || null,
        taxId: form.taxId.trim() || null,
      },
      { onSuccess: () => setForm(BLANK) }
    );
  }

  return (
    <AppShell title="Parties">
      <Card>
        <CardHeader>
          <CardTitle>New party</CardTitle>
          <CardDescription>Someone you invoice or buy from</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onCreate}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Name"
                required
                value={form.name}
              />
              <NativeSelect
                className="sm:w-40"
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value as EntityKind })
                }
                value={form.kind}
              >
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                placeholder="Email (optional)"
                type="email"
                value={form.email}
              />
              <Input
                onChange={(event) =>
                  setForm({ ...form, taxId: event.target.value })
                }
                placeholder="Tax ID (optional)"
                value={form.taxId}
              />
            </div>
            <Button
              disabled={create.isPending || !form.name.trim()}
              type="submit"
            >
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {create.isPending ? "Saving…" : "Add party"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {remove.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not delete</AlertTitle>
          <AlertDescription>{remove.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {entities.isLoading ? <Skeleton className="h-32 w-full" /> : null}

      {!entities.isLoading && entities.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No parties yet</EmptyTitle>
            <EmptyDescription>
              Add a customer above, then raise a document for them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {entities.data && entities.data.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tax ID</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entities.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.kind === "customer" ? "secondary" : "outline"
                        }
                      >
                        {row.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.taxId ?? "—"}
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
