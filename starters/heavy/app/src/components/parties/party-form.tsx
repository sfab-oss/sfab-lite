import type { FormEvent } from "react";
import type { PartyKind } from "../../contract/parties";
import { PARTY_KIND_LABEL, PARTY_KINDS } from "../../lib/party-kind";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export const BLANK_PARTY_FORM = {
  name: "",
  kind: "customer" as PartyKind,
  email: "",
  taxId: "",
};

export type PartyFormValues = typeof BLANK_PARTY_FORM;

const PARTY_KIND_ITEMS = PARTY_KINDS.map((kind) => ({
  value: kind,
  label: PARTY_KIND_LABEL[kind],
}));

export function PartyForm({
  value,
  onChange,
  onSubmit,
  pending,
  submitLabel,
}: {
  value: PartyFormValues;
  onChange: (next: PartyFormValues) => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="party-name">
            Name
          </FieldLabel>
          <Input
            id="party-name"
            onChange={(event) =>
              onChange({ ...value, name: event.target.value })
            }
            required
            value={value.name}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="party-kind">
            Kind
          </FieldLabel>
          <Select
            id="party-kind"
            items={PARTY_KIND_ITEMS}
            onValueChange={(kind) => {
              if (kind == null) {
                return;
              }
              onChange({ ...value, kind });
            }}
            required
            value={value.kind}
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
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="party-email">
            Email
          </FieldLabel>
          <Input
            id="party-email"
            onChange={(event) =>
              onChange({ ...value, email: event.target.value })
            }
            type="email"
            value={value.email}
          />
        </Field>
        <Field>
          <FieldLabel className="text-muted-foreground" htmlFor="party-tax">
            Tax ID
          </FieldLabel>
          <Input
            id="party-tax"
            onChange={(event) =>
              onChange({ ...value, taxId: event.target.value })
            }
            value={value.taxId}
          />
        </Field>
        <div className="flex justify-end pt-1">
          <Button disabled={pending || !value.name.trim()} type="submit">
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
