import type { FormEvent } from "react";
import { parseCents } from "../../lib/money";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

export const BLANK_ITEM_FORM = {
  name: "",
  sku: "",
  unitPrice: "",
};

export type ItemFormValues = typeof BLANK_ITEM_FORM;

export function ItemForm({
  value,
  onChange,
  onSubmit,
  pending,
  submitLabel,
}: {
  value: ItemFormValues;
  onChange: (next: ItemFormValues) => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  const unitPriceCents = parseCents(value.unitPrice);
  const canSubmit = value.name.trim().length > 0 && unitPriceCents >= 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit();
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="item-name">
            Name
          </FieldLabel>
          <Input
            id="item-name"
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
            required
            value={value.name}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="item-sku">
            SKU
          </FieldLabel>
          <Input
            id="item-sku"
            onChange={(event) =>
              onChange({ ...value, sku: event.target.value })
            }
            value={value.sku}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="item-price">
            Unit price
          </FieldLabel>
          <Input
            id="item-price"
            inputMode="decimal"
            onChange={(event) =>
              onChange({ ...value, unitPrice: event.target.value })
            }
            placeholder="0.00"
            required
            value={value.unitPrice}
          />
        </Field>
        <div className="flex justify-end pt-1">
          <Button disabled={pending || !canSubmit} type="submit">
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
