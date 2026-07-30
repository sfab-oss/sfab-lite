import { UpdateIcon } from "@radix-ui/react-icons";
import type * as React from "react";
import { cn } from "../../lib/utils";

function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof UpdateIcon>) {
  return (
    <UpdateIcon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
