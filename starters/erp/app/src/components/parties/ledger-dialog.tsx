import { type FormEvent, useState } from "react";
import { parseCents } from "../../lib/money";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

export function LedgerDialog({
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (
    input: { amountCents: number; memo: string | null },
    close: () => void
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const amountCents = parseCents(amount);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (amountCents <= 0) {
      return;
    }
    onSubmit(
      {
        amountCents,
        memo: memo.trim() || null,
      },
      () => {
        setAmount("");
        setMemo("");
        setOpen(false);
      }
    );
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAmount("");
          setMemo("");
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        {title}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={`${title}-amount`}
              >
                Amount
              </FieldLabel>
              <Input
                id={`${title}-amount`}
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                value={amount}
              />
            </Field>
            <Field>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={`${title}-memo`}
              >
                Memo
              </FieldLabel>
              <Input
                id={`${title}-memo`}
                onChange={(event) => setMemo(event.target.value)}
                value={memo}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button disabled={pending || amountCents <= 0} type="submit">
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
