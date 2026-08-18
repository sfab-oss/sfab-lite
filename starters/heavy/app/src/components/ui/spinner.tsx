import type * as React from "react";
import { cn } from "../../lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      data-slot="spinner"
      fill="none"
      role="status"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>Loading</title>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

export { Spinner };
