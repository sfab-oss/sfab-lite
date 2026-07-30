import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import { useAgent } from "agents/react";
import { ChevronDown, GitBranch } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface WorkspaceBranchInfo {
  branches: string[];
  current: string | null;
}

type CheckoutBranchResult =
  | { ok: true; current: string }
  | { ok: false; error: string };

export function WorkBranchSelector({ workspaceId }: { workspaceId: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agent = useAgent({
    agent: "AppAgent",
    name: workspaceId,
  });

  const refresh = useCallback(async () => {
    try {
      const info = (await agent.call(
        "workspaceBranch",
        []
      )) as WorkspaceBranchInfo;
      setCurrent(info.current);
      setBranches(info.branches);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agent]);

  useEffect(() => {
    let cancelled = false;
    agent.ready
      .then(() => {
        if (!cancelled) {
          return refresh();
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent.ready, refresh]);

  const onSelect = async (next: string) => {
    if (!next || next === current || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await agent.call("checkoutBranch", [
        next,
      ])) as CheckoutBranchResult;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent(result.current);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  let label = "branch";
  if (current) {
    label = current;
  } else if (busy) {
    label = "…";
  }

  let options = branches;
  if (options.length === 0 && current) {
    options = [current];
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Branch: ${label}`}
              className="h-7 max-w-48 gap-1.5 px-2 font-mono text-xs"
              disabled={busy}
              size="sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <GitBranch className="size-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44" side="top">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-muted-foreground text-xs">
              No branches yet
            </div>
          ) : (
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                onSelect(value).catch(() => undefined);
              }}
              value={current ?? undefined}
            >
              {options.map((branch) => (
                <DropdownMenuRadioItem
                  className="font-mono text-xs"
                  disabled={busy}
                  key={branch}
                  value={branch}
                >
                  {branch}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span
          className="max-w-40 truncate text-destructive text-xs"
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
