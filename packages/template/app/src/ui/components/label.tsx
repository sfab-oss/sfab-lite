import type * as React from "react";
import { cn } from "../lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: this is the primitive — callers pair `htmlFor` with the input's `id` (see `Field`).
    <label
      className={cn(
        "flex select-none items-center gap-2 font-medium text-sm leading-none",
        className
      )}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
