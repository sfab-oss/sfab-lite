import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MockThread } from "../lib/mock-threads";

export function ThreadBindingBadge({
  thread,
  size = "default",
  className,
}: {
  className?: string;
  size?: "default" | "sm";
  thread: MockThread;
}) {
  if (!thread.appName) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex shrink-0 outline-none"
            onPointerDown={(event) => event.stopPropagation()}
          />
        }
      >
        <Badge
          className={cn(
            "shrink-0 border border-border bg-muted font-normal text-muted-foreground",
            size === "sm" && "h-4 px-1 text-[10px]",
            className
          )}
          variant="outline"
        >
          {thread.appName}
        </Badge>
      </TooltipTrigger>
      <TooltipContent
        align="start"
        className="max-w-64 flex-col items-start gap-0.5 py-2 text-left"
        side={size === "sm" ? "right" : "bottom"}
      >
        <span className="font-medium text-[11px] uppercase tracking-wide opacity-80">
          App
        </span>
        <span className="text-pretty leading-snug">{thread.appName}</span>
        <span className="text-pretty text-[11px] leading-snug opacity-80">
          This thread belongs to {thread.appName}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
