import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { PARTY_KIND_LABEL, PARTY_KINDS } from "../../lib/party-kind";
import { Button } from "../ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const partyFormSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["customer", "vendor"]),
  email: z.union([z.literal(""), z.email()]),
  taxId: z.string().max(50),
});

type PartyFormValues = z.infer<typeof partyFormSchema>;

export interface PartyFormSubmit {
  name: string;
  kind: "customer" | "vendor";
  email: string | null;
  taxId: string | null;
}

const BLANK_PARTY_FORM: PartyFormValues = {
  name: "",
  kind: "customer",
  email: "",
  taxId: "",
};

const PARTY_KIND_ITEMS = PARTY_KINDS.map((kind) => ({
  value: kind,
  label: PARTY_KIND_LABEL[kind],
}));

function toSubmit(values: PartyFormValues): PartyFormSubmit {
  const email = values.email.trim();
  const taxId = values.taxId.trim();
  return {
    name: values.name,
    kind: values.kind,
    email: email === "" ? null : email,
    taxId: taxId === "" ? null : taxId,
  };
}

export function PartyForm({
  defaultValues = BLANK_PARTY_FORM,
  onSubmit,
  pending,
  submitLabel,
}: {
  defaultValues?: PartyFormValues;
  onSubmit: (values: PartyFormSubmit) => void;
  pending: boolean;
  submitLabel: string;
}) {
  const form = useForm<PartyFormValues>({
    resolver: zodResolver(partyFormSchema),
    defaultValues,
  });

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        onSubmit(toSubmit(values));
      })}
    >
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={field.name}
              >
                Name
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                id={field.name}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="kind"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={field.name}
              >
                Kind
              </FieldLabel>
              <Select
                id={field.name}
                items={PARTY_KIND_ITEMS}
                onValueChange={(kind) => {
                  if (kind == null) {
                    return;
                  }
                  field.onChange(kind);
                }}
                value={field.value}
              >
                <SelectTrigger
                  aria-invalid={fieldState.invalid}
                  className="w-full"
                >
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
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={field.name}
              >
                Email
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                id={field.name}
                type="email"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="taxId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel
                className="text-muted-foreground"
                htmlFor={field.name}
              >
                Tax ID
              </FieldLabel>
              <Input
                {...field}
                aria-invalid={fieldState.invalid}
                id={field.name}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <div className="flex justify-end pt-1">
          <Button
            disabled={pending || form.formState.isSubmitting}
            type="submit"
          >
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
