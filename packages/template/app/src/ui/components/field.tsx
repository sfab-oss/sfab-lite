import type * as React from "react";
import { Input } from "./input";
import { Label } from "./label";

/**
 * A labelled input. The `id` is required because the label points at it —
 * that association is what makes the field usable with a screen reader.
 */
function Field({
  label,
  id,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

export { Field };
