import { Link, useParams } from "@tanstack/react-router";
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
import { useAddCharge, useAddPayment, useParty } from "../hooks/use-parties";
import { formatCents, parseCents } from "../lib/money";
import { PARTY_KIND_LABEL } from "../lib/party-kind";

function LineForm({
  label,
  pending,
  onSubmit,
}: {
  label: string;
  pending: boolean;
  onSubmit: (input: { amountCents: number; memo: string | null }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseCents(amount);
    if (amountCents <= 0) {
      return;
    }
    onSubmit({
      amountCents,
      memo: memo.trim() || null,
    });
    setAmount("");
    setMemo("");
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor={`${label}-amount`}>Amount</FieldLabel>
          <Input
            id={`${label}-amount`}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            required
            value={amount}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${label}-memo`}>Memo</FieldLabel>
          <Input
            id={`${label}-memo`}
            onChange={(event) => setMemo(event.target.value)}
            value={memo}
          />
        </Field>
      </FieldGroup>
      <Button disabled={pending || parseCents(amount) <= 0} type="submit">
        {pending ? "Saving…" : label}
      </Button>
    </form>
  );
}

export function PartyDetailPage() {
  const { id } = useParams({ from: "/_app/parties/$id" });
  const detail = useParty(id);
  const charge = useAddCharge(id);
  const payment = useAddPayment(id);
  const party =
    detail.data && "party" in detail.data ? detail.data.party : null;
  const entries =
    detail.data && "entries" in detail.data ? detail.data.entries : [];
  const balanceCents =
    detail.data && "balanceCents" in detail.data ? detail.data.balanceCents : 0;

  return (
    <AppShell
      actions={
        <Link className="text-muted-foreground text-sm underline" to="/parties">
          All parties
        </Link>
      }
      title={party?.name ?? "Party"}
    >
      {detail.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : null}
      {detail.error ? (
        <p className="text-destructive text-sm" role="alert">
          {detail.error.message}
        </p>
      ) : null}

      {party ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Running balance</CardTitle>
              <CardDescription>
                {PARTY_KIND_LABEL[party.kind]} · {party.email ?? "no email"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-2xl tabular-nums">
                {formatCents(balanceCents)}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Charge</CardTitle>
                <CardDescription>Increases what they owe</CardDescription>
              </CardHeader>
              <CardContent>
                <LineForm
                  label="Record charge"
                  onSubmit={(input) => charge.mutate(input)}
                  pending={charge.isPending}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
                <CardDescription>Decreases what they owe</CardDescription>
              </CardHeader>
              <CardContent>
                <LineForm
                  label="Record payment"
                  onSubmit={(input) => payment.mutate(input)}
                  pending={payment.isPending}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ledger</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-muted-foreground text-sm">No lines yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Memo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="capitalize">{row.kind}</TableCell>
                        <TableCell>{formatCents(row.amountCents)}</TableCell>
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
        </>
      ) : null}
    </AppShell>
  );
}
