import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppShell } from "../components/layout/app-shell";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
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
import { cn } from "../lib/utils";

const BLANK = {
  name: "",
  kind: "customer" as PartyKind,
  email: "",
  taxId: "",
};

const selectClass = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
);

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
                  <select
                    className={selectClass}
                    id="party-kind"
                    onChange={(event) =>
                      setForm({
                        ...form,
                        kind: event.target.value as PartyKind,
                      })
                    }
                    value={form.kind}
                  >
                    {PARTY_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {PARTY_KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
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
        <p className="text-destructive text-sm" role="alert">
          {remove.error.message}
        </p>
      ) : null}

      {parties.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}

      {!parties.isLoading && parties.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No parties yet. Add a customer above, then record a charge.
        </p>
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
