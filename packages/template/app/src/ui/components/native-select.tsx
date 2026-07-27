import type * as React from "react";
import { cn } from "../lib/utils";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default";
};

/**
 * The platform's own select, styled to match `Input`.
 *
 * shadcn's rich `Select` is built on a popover and a Lucide chevron, and the
 * kernel serves no icon package — so the chevron is inline, the same way
 * `Spinner` is. That is the seed's icon rule while the kernel has no icon set:
 * a component may carry one inline glyph of its own, and anything wanting a
 * set of icons waits for the kernel to serve one.
 */
function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "relative w-full has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
    >
      <select
        className="h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=sm]:h-8 dark:bg-input/30 dark:aria-invalid:ring-destructive/40"
        data-size={size}
        data-slot="native-select"
        {...props}
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export { NativeSelect };
