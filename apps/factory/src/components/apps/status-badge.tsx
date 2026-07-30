import { Badge } from "@sfab-lite/ui/components/shadcn/badge";
import { cn } from "@sfab-lite/ui/lib/utils";
import type { AppRecord } from "@/hooks/use-apps";

export function StatusDot({ status }: { status: AppRecord["status"] }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 inline-block size-2 shrink-0 rounded-full",
        status === "ready" && "bg-emerald-500",
        status === "creating" && "bg-amber-500",
        status === "failed" && "bg-destructive"
      )}
      title={status}
    />
  );
}

export function StatusBadge({ status }: { status: AppRecord["status"] }) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  if (status === "ready") {
    variant = "default";
  } else if (status === "failed") {
    variant = "destructive";
  } else if (status === "creating") {
    variant = "secondary";
  }
  return (
    <Badge className="uppercase tracking-wide" variant={variant}>
      {status}
    </Badge>
  );
}
