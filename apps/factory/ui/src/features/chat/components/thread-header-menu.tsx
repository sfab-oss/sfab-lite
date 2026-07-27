import { DatabaseBackup, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceTabsStore } from "../lib/workspace-tabs-store";

export function ThreadHeaderMenu() {
  const resetLocalState = useWorkspaceTabsStore((s) => s.resetLocalState);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Thread actions"
            className="shrink-0 text-muted-foreground"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={resetLocalState}>
          <DatabaseBackup className="size-4" />
          Clear local storage
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
