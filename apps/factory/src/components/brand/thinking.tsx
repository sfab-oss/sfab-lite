import { AnimatedLogo } from "@sfab-lite/ui/components/icons/animated-logo";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sfab-lite/ui/components/shadcn/collapsible";
import { cn } from "@sfab-lite/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * Dedicated thinking chrome — not a message-part group. Title + optional body;
 * without a body it is a quiet pending/status row.
 */
export function Thinking({
  title,
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  loading = false,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  loading?: boolean;
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const hasBody = children != null && children !== false;

  const titleRow = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-muted-foreground text-sm",
        loading && "shimmer"
      )}
    >
      {loading ? (
        <AnimatedLogo className="size-3.5 shrink-0" variant="scan" />
      ) : null}
      <span className="truncate">{title}</span>
    </span>
  );

  if (!hasBody) {
    return (
      <div
        className={cn("my-1 w-full min-w-0", className)}
        role={loading ? "status" : undefined}
      >
        {titleRow}
      </div>
    );
  }

  return (
    <Collapsible
      className={cn("my-1 w-full min-w-0", className)}
      data-slot="thinking"
      onOpenChange={(next) => {
        if (!isControlled) {
          setUncontrolledOpen(next);
        }
        onOpenChange?.(next);
      }}
      open={open}
    >
      <CollapsibleTrigger
        className="inline-flex max-w-full cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        data-slot="thinking-trigger"
        role={loading ? "status" : undefined}
      >
        {titleRow}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="py-1 text-muted-foreground text-sm outline-none"
        data-slot="thinking-content"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Pre-token pending row before the first assistant part arrives. */
export function ThinkingPending({ className }: { className?: string }) {
  return <Thinking className={className} loading title="Thinking..." />;
}
