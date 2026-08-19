import { PlusIcon } from "@radix-ui/react-icons";
import { type FormEvent, useState } from "react";
import { useItems } from "../../hooks/use-items";
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

export function AddInvoiceLineDialog({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (
    input: { itemId: string; quantity: number },
    close: () => void
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const items = useItems();
  const catalog = items.data ?? [];
  const itemOptions = catalog.map((row) => ({
    value: row.id,
    label: row.name,
  }));
  const qty = Number.parseInt(quantity, 10);
  const canSubmit = Boolean(itemId) && Number.isFinite(qty) && qty > 0;

  function reset() {
    setItemId("");
    setQuantity("1");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({ itemId, quantity: qty }, () => {
      reset();
      setOpen(false);
    });
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
        render={
          <Button disabled={catalog.length === 0} size="sm" variant="outline" />
        }
      >
        <PlusIcon className="size-4" />
        Add line
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add line</DialogTitle>
          <DialogDescription>
            Price is snapshotted from the item at add time
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel className="text-muted-foreground" htmlFor="line-item">
                Item
              </FieldLabel>
              <Select
                id="line-item"
                items={itemOptions}
                onValueChange={(next) => {
                  if (next == null) {
                    return;
                  }
                  setItemId(next);
                }}
                required
                value={itemId || null}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an item" />
                </SelectTrigger>
                <SelectContent>
                  {itemOptions.map((item) => (
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
                htmlFor="line-quantity"
              >
                Quantity
              </FieldLabel>
              <Input
                id="line-quantity"
                inputMode="numeric"
                min={1}
                onChange={(event) => setQuantity(event.target.value)}
                required
                type="number"
                value={quantity}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end">
            <Button disabled={pending || !canSubmit} type="submit">
              {pending ? "Saving…" : "Add line"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
