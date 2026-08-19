import { PlusIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { useCreateItem } from "../../hooks/use-items";
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
import { BLANK_ITEM_FORM, ItemForm, type ItemFormValues } from "./item-form";

export function CreateItemDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ItemFormValues>(BLANK_ITEM_FORM);
  const create = useCreateItem();

  function onSubmit() {
    create.mutate(
      {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        unitPriceCents: parseCents(form.unitPrice),
      },
      {
        onSuccess: () => {
          setForm(BLANK_ITEM_FORM);
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
          setForm(BLANK_ITEM_FORM);
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon className="size-4" />
        New item
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New item</DialogTitle>
          <DialogDescription>A catalog row you can invoice</DialogDescription>
        </DialogHeader>
        <ItemForm
          onChange={setForm}
          onSubmit={onSubmit}
          pending={create.isPending}
          submitLabel="Create item"
          value={form}
        />
      </DialogContent>
    </Dialog>
  );
}
