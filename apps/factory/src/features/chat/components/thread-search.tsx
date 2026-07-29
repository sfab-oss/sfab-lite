import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Input } from "@sfab-lite/ui/components/shadcn/input";
import { cn } from "@sfab-lite/ui/lib/utils";
import { Search, X } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Collapsed search icon → expands in place to a field. No status/kind filters.
 * Focus comes from `autoFocus` on mount (the input only exists while expanded).
 */
export function ThreadSearch({
  className,
  onSearchChange,
  search,
}: {
  className?: string;
  onSearchChange: (search: string) => void;
  search: string;
}) {
  const [expanded, setExpanded] = useState(() => search.trim().length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  const collapseIfEmpty = () => {
    if (search.trim().length === 0) {
      setExpanded(false);
    }
  };

  if (!expanded) {
    return (
      <div className={cn("flex shrink-0 items-center", className)}>
        <Button
          aria-label="Search threads"
          className="size-6 shrink-0 text-muted-foreground"
          onClick={() => setExpanded(true)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Search className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1", className)}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search threads"
          autoFocus
          className="h-7 pr-7 pl-7 text-xs"
          onBlur={collapseIfEmpty}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onSearchChange("");
              setExpanded(false);
            }
          }}
          placeholder="Search threads…"
          ref={inputRef}
          value={search}
        />
        {search.length > 0 ? (
          <Button
            aria-label="Clear search"
            className="absolute top-1/2 right-0.5 size-6 -translate-y-1/2 text-muted-foreground"
            onClick={() => {
              onSearchChange("");
              inputRef.current?.focus();
            }}
            onMouseDown={(event) => event.preventDefault()}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
