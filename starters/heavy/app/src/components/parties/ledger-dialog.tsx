import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

const ledgerSchema = z.object({
  amount: z.string().refine((value) => parseCents(value) > 0, {
    message: "Enter an amount",
  }),
  memo: z.string(),
});

type LedgerValues = z.infer<typeof ledgerSchema>;

const BLANK_LEDGER: LedgerValues = { amount: "", memo: "" };

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
  const form = useForm<LedgerValues>({
    resolver: zodResolver(ledgerSchema),
    defaultValues: BLANK_LEDGER,
  });

  function close() {
    form.reset(BLANK_LEDGER);
    setOpen(false);
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset(BLANK_LEDGER);
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
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => {
            onSubmit(
              {
                amountCents: parseCents(values.amount),
                memo: values.memo.trim() || null,
              },
              close
            );
          })}
        >
          <FieldGroup className="gap-4">
            <Controller
              control={form.control}
              name="amount"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="text-muted-foreground"
                    htmlFor={field.name}
                  >
                    Amount
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    id={field.name}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="memo"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="text-muted-foreground"
                    htmlFor={field.name}
                  >
                    Memo
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    id={field.name}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              disabled={pending || form.formState.isSubmitting}
              type="submit"
            >
              {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
