import { Badge } from "@sfab-lite/ui/components/shadcn/badge";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sfab-lite/ui/components/shadcn/tabs";
import {
  ChevronLeft,
  FolderTree,
  Globe,
  History,
  type LucideIcon,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useChatData } from "@/components/chat/chat-data-context";
import {
  type OpenTab,
  useAppWorkspaceTabs,
  useWorkspaceTabsStore,
  WORKSPACE_KINDS,
  type WorkspaceKind,
} from "@/lib/chat/workspace-tabs-store";
import { subscribeLive } from "@/lib/preview/live-bus";
import { SessionTabBrowser } from "./session-tab-browser";
import { SessionTabFiles } from "./session-tab-files";

const WORKSPACE_DEFS: Record<
  WorkspaceKind,
  { icon: LucideIcon; title: string }
> = {
  browser: { icon: Globe, title: "Browser" },
  files: { icon: FolderTree, title: "Published files" },
  versions: { icon: History, title: "Live tip" },
};

function tabLabel(tab: OpenTab, peers: OpenTab[]): string {
  const base = WORKSPACE_DEFS[tab.kind].title;
  const same = peers.filter((entry) => entry.kind === tab.kind);
  if (same.length <= 1) {
    return base;
  }
  const index = same.findIndex((entry) => entry.id === tab.id);
  return `${base} ${index + 1}`;
}

function WorkspaceTabIcon({ tab }: { tab: OpenTab }) {
  const Icon = WORKSPACE_DEFS[tab.kind].icon;
  return <Icon className="size-3.5 shrink-0" />;
}

function LiveTipBody() {
  const data = useChatData();
  const appId = data.getAppId();
  const [liveSha, setLiveSha] = useState(() => data.getLiveSha());

  useEffect(() => {
    setLiveSha(data.getLiveSha());
  }, [data]);

  useEffect(() => {
    if (!appId) {
      return;
    }
    return subscribeLive((nextAppId, nextLiveSha) => {
      if (nextAppId !== appId) {
        return;
      }
      setLiveSha(nextLiveSha);
      data.refreshApp(appId).catch((error: unknown) => {
        console.error("[workspace] live tip refresh failed", error);
      });
    });
  }, [appId, data]);

  if (!liveSha) {
    return (
      <p className="p-3 text-muted-foreground text-sm">No live tip yet.</p>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1 overflow-auto p-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">live {liveSha.slice(0, 12)}</p>
          <p className="truncate font-mono text-muted-foreground text-xs">
            {liveSha}
          </p>
        </div>
        <Badge className="shrink-0" variant="secondary">
          Live
        </Badge>
      </div>
    </div>
  );
}

function TabBody({ active, tab }: { active: boolean; tab: OpenTab }) {
  if (tab.kind === "files") {
    return <SessionTabFiles />;
  }
  if (tab.kind === "browser") {
    return <SessionTabBrowser active={active} />;
  }
  return <LiveTipBody />;
}

function AddTabMenu({ onOpen }: { onOpen: (kind: WorkspaceKind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="size-8 shrink-0" size="icon" variant="ghost" />
        }
      >
        <Plus className="size-4" />
        <span className="sr-only">Open a view</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {WORKSPACE_KINDS.map((kind) => {
          const Icon = WORKSPACE_DEFS[kind].icon;
          return (
            <DropdownMenuItem key={kind} onClick={() => onOpen(kind)}>
              <Icon className="size-4" />
              {WORKSPACE_DEFS[kind].title}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceEmptyState({
  onOpen,
}: {
  onOpen: (kind: WorkspaceKind) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <p className="font-medium">Open a view</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Browse published files, open a preview, or check versions.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {WORKSPACE_KINDS.map((kind) => {
          const Icon = WORKSPACE_DEFS[kind].icon;
          return (
            <Button
              key={kind}
              onClick={() => onOpen(kind)}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" />
              {WORKSPACE_DEFS[kind].title}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function SessionWorkspacePanel({
  appId,
  onDismiss,
}: {
  appId: string;
  onDismiss?: () => void;
}) {
  const { tabs, activeId } = useAppWorkspaceTabs(appId);
  const openTab = useWorkspaceTabsStore((s) => s.openTab);
  const closeTab = useWorkspaceTabsStore((s) => s.closeTab);
  const focusTab = useWorkspaceTabsStore((s) => s.focusTab);

  return (
    <Tabs
      className="flex h-full min-h-0 flex-col gap-0 bg-muted/15"
      onValueChange={(id) => focusTab(appId, id)}
      value={activeId ?? ""}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
        {onDismiss ? (
          <Button
            aria-label="Close panel"
            className="size-8 shrink-0"
            onClick={onDismiss}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
        ) : null}
        <TabsList className="h-9 min-w-0 flex-1 justify-start gap-1 overflow-x-auto bg-transparent p-0">
          {tabs.map((tab) => {
            const label = tabLabel(tab, tabs);
            return (
              <div className="relative flex shrink-0 items-center" key={tab.id}>
                <TabsTrigger
                  className="h-8 max-w-44 gap-1.5 pr-9 data-[state=active]:bg-muted"
                  value={tab.id}
                >
                  <WorkspaceTabIcon tab={tab} />
                  <span className="truncate">{label}</span>
                </TabsTrigger>
                <button
                  aria-label={`Close ${label}`}
                  className="absolute right-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                  onClick={() => closeTab(appId, tab.id)}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </TabsList>
        <AddTabMenu onOpen={(kind) => openTab(appId, kind)} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <WorkspaceEmptyState onOpen={(kind) => openTab(appId, kind)} />
        ) : (
          tabs.map((tab) => (
            <TabsContent
              className="h-full min-h-0 overflow-hidden data-[state=inactive]:hidden"
              keepMounted
              key={tab.id}
              value={tab.id}
            >
              <TabBody active={activeId === tab.id} tab={tab} />
            </TabsContent>
          ))
        )}
      </div>
    </Tabs>
  );
}
