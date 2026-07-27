import { ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NEW_APP_VALUE = "__new__";

export interface ComposerScope {
  appId: string | null;
  appName: string | null;
  apps: Array<{ appId: string; appName: string }>;
  onAttendApp: (appId: string, appName: string) => void;
  onClearScope: () => void;
}

export function ComposerScopeChip({
  appId,
  appName,
  apps,
  onAttendApp,
  onClearScope,
}: ComposerScope) {
  const label = appId ? (appName ?? "App") : "New app";
  const value = appId ?? NEW_APP_VALUE;

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
          className="cursor-pointer border border-border bg-muted font-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          variant="outline"
        >
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Send to</DropdownMenuLabel>
        </DropdownMenuGroup>
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
