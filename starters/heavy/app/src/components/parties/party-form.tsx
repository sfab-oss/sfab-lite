import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { z } from "zod";
import { PARTY_KIND_LABEL, PARTY_KINDS } from "../../lib/party-kind";
import { Button } from "../ui/button";
import { Field, FieldGroup, FieldLabel } from "../ui/field";
import { Form } from "../ui/form";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

/** Client-side form schema aligned with `partyCreateSchema` (empty → null). */
const partyFormSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["customer", "vendor"]),
  email: z
    .string()
    .max(200)
    .transform((value) => value.trim())
    .pipe(z.union([z.literal(""), z.email()]))
    .transform((value) => (value === "" ? null : value)),
  taxId: z
    .string()
    .max(50)
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value)),
});

type PartyFormValues = z.input<typeof partyFormSchema>;
type PartyFormSubmit = z.output<typeof partyFormSchema>;

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

const partyFormResolver = zodResolver(partyFormSchema as never) as Resolver<
  PartyFormValues,
  unknown,
  PartyFormSubmit
>;

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
  const form = useForm<PartyFormValues, unknown, PartyFormSubmit>({
    resolver: partyFormResolver,
    defaultValues,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          onSubmit(values);
        })}
      >
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel className="text-muted-foreground" htmlFor="party-name">
              Name
            </FieldLabel>
            <Input
              aria-invalid={!!form.formState.errors.name || undefined}
              id="party-name"
              {...form.register("name")}
            />
          </Field>
          <Field data-invalid={!!form.formState.errors.kind || undefined}>
            <FieldLabel className="text-muted-foreground" htmlFor="party-kind">
              Kind
            </FieldLabel>
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select
                  id="party-kind"
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
                    aria-invalid={!!form.formState.errors.kind || undefined}
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
              )}
            />
          </Field>
          <Field data-invalid={!!form.formState.errors.email || undefined}>
            <FieldLabel className="text-muted-foreground" htmlFor="party-email">
              Email
            </FieldLabel>
            <Input
              aria-invalid={!!form.formState.errors.email || undefined}
              id="party-email"
              type="email"
              {...form.register("email")}
            />
          </Field>
          <Field data-invalid={!!form.formState.errors.taxId || undefined}>
            <FieldLabel className="text-muted-foreground" htmlFor="party-tax">
              Tax ID
            </FieldLabel>
            <Input
              aria-invalid={!!form.formState.errors.taxId || undefined}
              id="party-tax"
              {...form.register("taxId")}
            />
          </Field>
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
    </Form>
  );
}
