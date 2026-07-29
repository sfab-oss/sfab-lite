import { AnimatedLogo } from "@sfab-lite/ui/components/icons/animated-logo";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sfab-lite/ui/components/shadcn/collapsible";
import { cn } from "@sfab-lite/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import {
  describeMessagePartGroup,
  type IndexedMessagePart,
} from "./message-part-group-policy";

const MessagePartGroupUiContext = createContext<{ open: boolean } | null>(null);

export function useMessagePartGroupUi() {
  return useContext(MessagePartGroupUiContext);
}

/**
 * Collapsible wrapper for a run of nested message parts. Only used for
 * grouping — not for thinking rows (see `Thinking`).
 */
export function MessagePartGroup({
  items,
  defaultOpen,
  isTurnBusy = false,
  children,
  className,
}: {
  items: IndexedMessagePart[];
  defaultOpen: boolean;
  isTurnBusy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const status = describeMessagePartGroup(items, { isTurnBusy });
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const open = userOverride ?? defaultOpen;

  const isThinking = status.phase === "thinking";
  const isLive = isThinking || status.phase === "calling";
  const showHeaderLoading = isThinking && !open;
  const headerLabel = isLive && open ? "Working" : status.label;

  return (
    <MessagePartGroupUiContext.Provider value={{ open }}>
      <Collapsible
        className={cn("my-1 w-full min-w-0", className)}
        onOpenChange={(next) => setUserOverride(next)}
        open={open}
      >
        <CollapsibleTrigger
          className="inline-flex max-w-full cursor-pointer items-center gap-1.5 font-medium text-sm transition-colors hover:text-foreground"
          role={isLive ? "status" : undefined}
        >
          {showHeaderLoading ? (
            <AnimatedLogo
              className="size-4 shrink-0 text-muted-foreground"
              variant="scan"
            />
          ) : null}
          <span
            className={cn(
              "truncate",
              showHeaderLoading && "shimmer text-muted-foreground"
            )}
          >
            {headerLabel}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 py-1 outline-none">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </MessagePartGroupUiContext.Provider>
  );
}
