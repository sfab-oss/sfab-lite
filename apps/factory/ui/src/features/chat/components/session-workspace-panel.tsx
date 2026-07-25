import {
  ChevronLeft,
  FolderTree,
  Globe,
  History,
  type LucideIcon,
  Plus,
  SquareTerminal,
  X,
} from "lucide-react";
import { AgentSigil } from "@/components/icons/agent-sigil";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lookupSubagent } from "../lib/mock-subagents";
import { MOCK_VERSIONS } from "../lib/mock-versions";
import {
  type OpenTab,
  useThreadTabs,
  useWorkspaceTabsStore,
  type WorkspaceKind,
} from "../lib/workspace-tabs-store";
import { MockAgentRunPanel } from "./mock-agent-run-panel";
import { MockSessionTabFiles } from "./mock-session-tab-files";

const WORKSPACE_DEFS: Record<
  WorkspaceKind,
  { icon: LucideIcon; title: string }
> = {
  browser: { icon: Globe, title: "Browser" },
  files: { icon: FolderTree, title: "Files" },
  terminal: { icon: SquareTerminal, title: "Terminal" },
  versions: { icon: History, title: "Versions" },
};

const WORKSPACE_KINDS: WorkspaceKind[] = [
  "files",
  "terminal",
  "browser",
  "versions",
];

const MOCK_TERMINAL_LINES = [
  "pnpm test invoices",
  "",
  " ✓ src/features/invoices/__tests__/export.test.ts (7)",
  " ✓ src/features/invoices/__tests__/filters.test.ts (5)",
  "",
  " Test Files  2 passed (2)",
  "      Tests  12 passed (12)",
];

function tabLabel(tab: OpenTab, threadId: string, peers: OpenTab[]): string {
  if (tab.kind === "agent-run" && tab.agentRunId) {
    return lookupSubagent(threadId, tab.agentRunId)?.title ?? "Agent run";
  }
  if (tab.kind === "agent-run") {
    return "Agent run";
  }
  const base = WORKSPACE_DEFS[tab.kind].title;
  const same = peers.filter((entry) => entry.kind === tab.kind);
  if (same.length <= 1) {
    return base;
  }
  const index = same.findIndex((entry) => entry.id === tab.id);
  return `${base} ${index + 1}`;
}

function tabIcon(kind: WorkspaceKind): LucideIcon {
  return WORKSPACE_DEFS[kind].icon;
}

function WorkspaceTabIcon({
  tab,
  threadId,
}: {
  tab: OpenTab;
  threadId: string;
}) {
  if (tab.kind === "agent-run" && tab.agentRunId) {
    const seed = lookupSubagent(threadId, tab.agentRunId)?.seed;
    if (seed) {
      return (
        <AgentSigil className="size-3.5 shrink-0 text-foreground" id={seed} />
      );
    }
    return null;
  }
  if (tab.kind === "agent-run") {
    return null;
  }
  const Icon = tabIcon(tab.kind);
  return <Icon className="size-3.5 shrink-0" />;
}

function VersionsBody() {
  return (
    <ul className="flex h-full flex-col gap-1 overflow-auto p-3">
      {MOCK_VERSIONS.map((version) => (
        <li
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
          key={version.id}
        >
          <div className="min-w-0">
            <p className="font-medium text-sm">{version.label}</p>
            <p className="text-muted-foreground text-xs">{version.createdAt}</p>
          </div>
          {version.live ? (
            <Badge className="shrink-0" variant="secondary">
              Live
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TabBody({ tab, threadId }: { tab: OpenTab; threadId: string }) {
  if (tab.kind === "files") {
    return <MockSessionTabFiles />;
  }
  if (tab.kind === "terminal") {
    return (
      <pre className="h-full overflow-auto p-3 font-mono text-muted-foreground text-xs">
        {MOCK_TERMINAL_LINES.join("\n")}
      </pre>
    );
  }
  if (tab.kind === "browser") {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b px-3 py-2 font-mono text-muted-foreground text-xs">
          http://localhost:5173/invoices
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Preview
        </div>
      </div>
    );
  }
  if (tab.kind === "versions") {
    return <VersionsBody />;
  }
  if (tab.agentRunId) {
    return <MockAgentRunPanel runId={tab.agentRunId} threadId={threadId} />;
  }
  return null;
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
          Browse files, inspect command output, open a preview, or check
          versions.
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
  threadId,
  onDismiss,
}: {
  onDismiss?: () => void;
  threadId: string;
}) {
  const { tabs, activeId } = useThreadTabs(threadId);
  const openTab = useWorkspaceTabsStore((s) => s.openTab);
  const closeTab = useWorkspaceTabsStore((s) => s.closeTab);
  const focusTab = useWorkspaceTabsStore((s) => s.focusTab);

  return (
    <Tabs
      className="flex h-full min-h-0 flex-col gap-0 bg-muted/15"
      onValueChange={(id) => focusTab(threadId, id)}
      value={activeId ?? ""}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2">
        {onDismiss ? (
          <Button
            aria-label="Close workspace"
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
            const label = tabLabel(tab, threadId, tabs);
            return (
              <div className="relative flex shrink-0 items-center" key={tab.id}>
                <TabsTrigger
                  className="h-8 max-w-44 gap-1.5 pr-9 data-[state=active]:bg-muted"
                  value={tab.id}
                >
                  <WorkspaceTabIcon tab={tab} threadId={threadId} />
                  <span className="truncate">{label}</span>
                </TabsTrigger>
                <button
                  aria-label={`Close ${label}`}
                  className="absolute right-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                  onClick={() => closeTab(threadId, tab.id)}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </TabsList>
        <AddTabMenu onOpen={(kind) => openTab(threadId, kind)} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <WorkspaceEmptyState onOpen={(kind) => openTab(threadId, kind)} />
        ) : (
          tabs.map((tab) => (
            <TabsContent
              className="h-full min-h-0 overflow-hidden data-[state=inactive]:hidden"
              keepMounted
              key={tab.id}
              value={tab.id}
            >
              <TabBody tab={tab} threadId={threadId} />
            </TabsContent>
          ))
        )}
      </div>
    </Tabs>
  );
}
