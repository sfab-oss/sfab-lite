import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NEW_APP_VALUE = "__new__";

export function ComposerScopeChip({
  apps,
  onAttendApp,
  onClearScope,
  scopeAppId,
  scopeAppName,
}: {
  apps: Array<{ appId: string; appName: string }>;
  onAttendApp: (appId: string, appName: string) => void;
  onClearScope: () => void;
  scopeAppId: string | null;
  scopeAppName: string | null;
}) {
  const label = scopeAppId ? (scopeAppName ?? "App") : "New app";
  const value = scopeAppId ?? NEW_APP_VALUE;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={`App scope: ${label}`}
            className="inline-flex shrink-0 outline-none"
            type="button"
          />
        }
      >
        <Badge
          className={cn(
            "cursor-pointer border border-border bg-muted font-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          variant="outline"
        >
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48" side="top">
        <DropdownMenuLabel>Send to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          onValueChange={(next) => {
            if (next === NEW_APP_VALUE) {
              onClearScope();
              return;
            }
            const app = apps.find((entry) => entry.appId === next);
            if (app) {
              onAttendApp(app.appId, app.appName);
            }
          }}
          value={value}
        >
          <DropdownMenuRadioItem value={NEW_APP_VALUE}>
            New app
          </DropdownMenuRadioItem>
          {apps.map((app) => (
            <DropdownMenuRadioItem key={app.appId} value={app.appId}>
              <span className="truncate">{app.appName}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
