import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import type { PartyKind } from "../contract/parties";
import {
  useCreateParty,
  useDeleteParty,
  useParties,
} from "../hooks/use-parties";
import { formatCents } from "../lib/money";
import { PARTY_KIND_LABEL, PARTY_KINDS } from "../lib/party-kind";

const BLANK = {
  name: "",
  kind: "customer" as PartyKind,
  email: "",
  taxId: "",
};

const PARTY_KIND_ITEMS = PARTY_KINDS.map((kind) => ({
  value: kind,
  label: PARTY_KIND_LABEL[kind],
}));

export function PartiesPage() {
  const parties = useParties();
  const [form, setForm] = useState(BLANK);
  const create = useCreateParty();
  const remove = useDeleteParty();

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
          <CardDescription>Someone you charge or pay</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onCreate}>
            <FieldGroup className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Field className="flex-1">
                  <FieldLabel htmlFor="party-name">Name</FieldLabel>
                  <Input
                    id="party-name"
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    required
                    value={form.name}
                  />
                </Field>
                <Field className="sm:w-40">
                  <FieldLabel htmlFor="party-kind">Kind</FieldLabel>
                  <Select
                    id="party-kind"
                    items={PARTY_KIND_ITEMS}
                    onValueChange={(kind) => {
                      if (kind == null) {
                        return;
                      }
                      setForm({ ...form, kind });
                    }}
                    required
                    value={form.kind}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTY_KIND_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Field className="flex-1">
                  <FieldLabel htmlFor="party-email">Email</FieldLabel>
                  <Input
                    id="party-email"
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    type="email"
                    value={form.email}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor="party-tax">Tax ID</FieldLabel>
                  <Input
                    id="party-tax"
                    onChange={(event) =>
                      setForm({ ...form, taxId: event.target.value })
                    }
                    value={form.taxId}
                  />
                </Field>
              </div>
            </FieldGroup>
            <Button
              disabled={create.isPending || !form.name.trim()}
              type="submit"
            >
              {create.isPending ? "Saving…" : "Add party"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {remove.error ? (
        <Alert variant="destructive">
          <AlertDescription>{remove.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {parties.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}

      {!parties.isLoading && parties.data?.length === 0 ? (
        <EmptyState
          description="Add a customer above, then record a charge."
          title="No parties yet"
        />
      ) : null}

      {parties.data && parties.data.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parties.data.map((row) => (
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
                      {PARTY_KIND_LABEL[row.kind]}
                    </TableCell>
                    <TableCell>{formatCents(row.balanceCents)}</TableCell>
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
