import type * as React from "react";
import { cn } from "../../lib/utils";

function EmptyState({
  title,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  description?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center",
        className
      )}
      data-slot="empty-state"
      {...props}
    >
      <div
        className="font-medium text-sm tracking-tight"
        data-slot="empty-state-title"
      >
        {title}
      </div>
      {description ? (
        <p
          className="text-muted-foreground text-sm"
          data-slot="empty-state-description"
        >
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-2" data-slot="empty-state-action">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export { EmptyState };
