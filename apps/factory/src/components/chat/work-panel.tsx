import { useDroppable } from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { cn } from "@sfab-lite/ui/lib/utils";
import {
  FolderTree,
  Globe,
  History,
  type LucideIcon,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Plus,
  X,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useChatData } from "@/components/chat/chat-data-context";
import {
  type OpenTab,
  type PanelId,
  type PanelState,
  panelDroppableId,
  useWorkspaceTabsStore,
  VIEW_KINDS,
  type ViewKind,
} from "@/lib/chat/workspace-tabs-store";
import { subscribeLive } from "@/lib/preview/live-bus";
import { SessionTabBrowser } from "./session-tab-browser";
import { SessionTabFiles } from "./session-tab-files";

const VIEW_DEFS: Record<ViewKind, { icon: LucideIcon; title: string }> = {
  chat: { icon: MessageSquare, title: "Chat" },
  browser: { icon: Globe, title: "Browser" },
  files: { icon: FolderTree, title: "Files" },
  versions: { icon: History, title: "Live tip" },
};

function tabLabel(tab: OpenTab, peers: OpenTab[]): string {
  const base = VIEW_DEFS[tab.kind].title;
  const same = peers.filter((entry) => entry.kind === tab.kind);
  if (same.length <= 1) {
    return base;
  }
  const index = same.findIndex((entry) => entry.id === tab.id);
  return `${base} ${index + 1}`;
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

function TabBody({
  active,
  chat,
  tab,
}: {
  active: boolean;
  chat: ReactNode;
  tab: OpenTab;
}) {
  if (tab.kind === "chat") {
    return <>{chat}</>;
  }
  if (tab.kind === "files") {
    return <SessionTabFiles />;
  }
  if (tab.kind === "browser") {
    return <SessionTabBrowser active={active} />;
  }
  return <LiveTipBody />;
}

function AddTabMenu({ onOpen }: { onOpen: (kind: ViewKind) => void }) {
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
      <DropdownMenuContent align="end" className="min-w-44">
        {VIEW_KINDS.map((kind) => {
          const Icon = VIEW_DEFS[kind].icon;
          return (
            <DropdownMenuItem key={kind} onClick={() => onOpen(kind)}>
              <Icon className="size-4" />
              {VIEW_DEFS[kind].title}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabOptionsMenu({
  appId,
  panel,
  tabId,
}: {
  appId: string;
  panel: PanelId;
  tabId: string;
}) {
  const moveTab = useWorkspaceTabsStore((s) => s.moveTab);
  const other: PanelId = panel === "primary" ? "secondary" : "primary";
  const toRight = panel === "primary";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label="Tab options"
            className="absolute right-7 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            title="Tab options"
            type="button"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => moveTab(appId, panel, tabId, other)}>
          {toRight ? (
            <>
              <PanelRight className="size-4" />
              Move to the right
            </>
          ) : (
            <>
              <PanelLeft className="size-4" />
              Move to the left
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyPanel({ appId, panel }: { appId: string; panel: PanelId }) {
  const openTab = useWorkspaceTabsStore((s) => s.openTab);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <p className="font-medium">Open a view</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Chat, browser, files, or live tip.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {VIEW_KINDS.map((kind) => {
          const Icon = VIEW_DEFS[kind].icon;
          return (
            <Button
              key={kind}
              onClick={() => openTab(appId, kind, panel)}
              size="sm"
              variant="outline"
            >
              <Icon className="size-4" />
              {VIEW_DEFS[kind].title}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function WorkTabChrome({
  appId,
  panel,
  tab,
  tabs,
  dragHandleProps,
  setNodeRef,
  style,
  isDragging,
}: {
  appId: string;
  panel: PanelId;
  tab: OpenTab;
  tabs: OpenTab[];
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
}) {
  const closeTab = useWorkspaceTabsStore((s) => s.closeTab);
  const label = tabLabel(tab, tabs);
  const Icon = VIEW_DEFS[tab.kind].icon;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center",
        isDragging && "z-10 opacity-60"
      )}
      ref={setNodeRef}
      style={style}
    >
      <TabsTrigger
        className={cn(
          "h-8 max-w-52 gap-1.5 pr-14 data-[state=active]:bg-muted",
          dragHandleProps && "cursor-grab active:cursor-grabbing"
        )}
        value={tab.id}
        {...dragHandleProps}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </TabsTrigger>
      <TabOptionsMenu appId={appId} panel={panel} tabId={tab.id} />
      <button
        aria-label={`Close ${label}`}
        className="absolute right-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          closeTab(appId, panel, tab.id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function SortableWorkTab({
  appId,
  panel,
  tab,
  tabs,
}: {
  appId: string;
  panel: PanelId;
  tab: OpenTab;
  tabs: OpenTab[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  return (
    <WorkTabChrome
      appId={appId}
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      panel={panel}
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      tab={tab}
      tabs={tabs}
    />
  );
}

export function WorkPanel({
  appId,
  panel,
  state,
  focused,
  chat,
  className,
  sortable = false,
}: {
  appId: string;
  panel: PanelId;
  state: PanelState;
  focused: boolean;
  chat: ReactNode;
  className?: string;
  sortable?: boolean;
}) {
  const openTab = useWorkspaceTabsStore((s) => s.openTab);
  const focusTab = useWorkspaceTabsStore((s) => s.focusTab);
  const { tabs, activeId } = state;
  const { setNodeRef, isOver } = useDroppable({
    id: panelDroppableId(panel),
    disabled: !sortable,
  });

  const tabItems = tabs.map((tab) =>
    sortable ? (
      <SortableWorkTab
        appId={appId}
        key={tab.id}
        panel={panel}
        tab={tab}
        tabs={tabs}
      />
    ) : (
      <WorkTabChrome
        appId={appId}
        key={tab.id}
        panel={panel}
        tab={tab}
        tabs={tabs}
      />
    )
  );

  const tabStrip = (
    <TabsList
      className={cn(
        "h-9 min-w-0 flex-1 justify-start gap-1 overflow-x-auto bg-transparent p-0",
        sortable && isOver && "rounded-md ring-1 ring-ring/40"
      )}
      ref={sortable ? setNodeRef : undefined}
    >
      {tabItems}
    </TabsList>
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        focused ? "bg-background" : "bg-muted/10",
        className
      )}
    >
      <Tabs
        className="flex h-full min-h-0 flex-col gap-0"
        onValueChange={(id) => focusTab(appId, panel, id)}
        value={activeId ?? ""}
      >
        <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
          {sortable ? (
            <SortableContext
              items={tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {tabStrip}
            </SortableContext>
          ) : (
            tabStrip
          )}
          <AddTabMenu onOpen={(kind) => openTab(appId, kind, panel)} />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tabs.length === 0 ? (
            <EmptyPanel appId={appId} panel={panel} />
          ) : (
            tabs.map((tab) => (
              <TabsContent
                className="h-full min-h-0 overflow-hidden data-[state=inactive]:hidden"
                keepMounted
                key={tab.id}
                value={tab.id}
              >
                <TabBody active={activeId === tab.id} chat={chat} tab={tab} />
              </TabsContent>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}
