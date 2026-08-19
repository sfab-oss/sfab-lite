import { PlusIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useCreateInvoice } from "../../hooks/use-invoices";
import { useParties } from "../../hooks/use-parties";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export function CreateInvoiceDialog() {
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [memo, setMemo] = useState("");
  const parties = useParties();
  const create = useCreateInvoice();

  const customers = (parties.data ?? []).filter(
    (row) => row.kind === "customer"
  );
  const partyItems = customers.map((row) => ({
    value: row.id,
    label: row.name,
  }));

  function reset() {
    setPartyId("");
    setMemo("");
  }

  function onSubmit() {
    if (!partyId) {
      return;
    }
    create.mutate(
      {
        partyId,
        memo: memo.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      }
    );
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={<Button disabled={customers.length === 0} size="sm" />}
      >
        <PlusIcon className="size-4" />
        New invoice
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Starts as a draft against an existing customer
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor="invoice-party"
              >
                Customer
              </FieldLabel>
              <Select
                id="invoice-party"
                items={partyItems}
                onValueChange={(next) => {
                  if (next == null) {
                    return;
                  }
                  setPartyId(next);
                }}
                required
                value={partyId || null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {partyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor="invoice-memo"
              >
                Memo
              </FieldLabel>
              <Input
                id="invoice-memo"
                onChange={(event) => setMemo(event.target.value)}
                value={memo}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button disabled={create.isPending || !partyId} type="submit">
              {create.isPending ? "Saving…" : "Create invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
