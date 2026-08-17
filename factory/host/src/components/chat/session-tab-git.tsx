import { useAgent } from "agents/react";
import { FileDiff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConsoleRoute } from "@/hooks/use-console-route";
import { workspaceChangeEventSchema } from "@/lib/chat/workspace-agent-events";
import { useWorkspaceSelectedPathStore } from "@/lib/chat/workspace-selected-path-store";
import { useWorkspaceTabsStore } from "@/lib/chat/workspace-tabs-store";

interface GitStatusEntry {
  path: string;
  status: string;
}

const LEADING_SLASHES = /^\/+/;

function normalizeUiPath(path: string): string {
  return path.replace(LEADING_SLASHES, "");
}

export function SessionTabGit() {
  const { workspaceId } = useConsoleRoute();

  if (!workspaceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">No workspace selected</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Open a workspace to review pending changes.
        </p>
      </div>
    );
  }

  return <GitStatusBody key={workspaceId} workspaceId={workspaceId} />;
}

function GitStatusBody({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<GitStatusEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openTab = useWorkspaceTabsStore((s) => s.openTab);
  const setSelectedPath = useWorkspaceSelectedPathStore(
    (s) => s.setSelectedPath
  );
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const agent = useAgent({
    agent: "AppAgent",
    name: workspaceId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      try {
        const parsed = workspaceChangeEventSchema.safeParse(
          JSON.parse(event.data)
        );
        if (!parsed.success) {
          return;
        }
        if (parsed.data.type === "workspace-change") {
          refreshRef.current().catch(() => undefined);
        }
      } catch {
        // Non-JSON frame.
      }
    },
  });

  const refresh = useCallback(async () => {
    try {
      await agent.ready;
      const next = (await agent.call("workspaceGitStatus", [])) as
        | GitStatusEntry[]
        | unknown;
      if (!Array.isArray(next)) {
        setEntries([]);
        setError(null);
        return;
      }
      setEntries(
        next.map((row) => ({
          path: normalizeUiPath(String(row.path ?? "")),
          status: String(row.status ?? "modified"),
        }))
      );
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agent]);

  refreshRef.current = refresh;

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

  const onOpenPath = (path: string) => {
    if (!path) {
      return;
    }
    setSelectedPath(workspaceId, path);
    openTab(workspaceId, "files");
  };

  if (error) {
    return (
      <p className="p-3 text-destructive text-sm" title={error}>
        {error}
      </p>
    );
  }

  if (entries === null) {
    return <p className="p-3 text-muted-foreground text-sm">Loading status…</p>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <FileDiff className="size-6 text-muted-foreground" />
        <p className="font-medium text-sm">Working tree clean</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          No pending changes versus HEAD.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b px-3 py-2 text-muted-foreground text-xs">
        {entries.length} pending change{entries.length === 1 ? "" : "s"} — click
        a path to open in Files. Commit or discard via the agent.
      </p>
      <ul className="min-h-0 flex-1 overflow-auto py-1 text-sm">
        {entries.map((entry) => (
          <li key={entry.path}>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted"
              onClick={() => onOpenPath(entry.path)}
              type="button"
            >
              <span className="w-20 shrink-0 font-mono text-muted-foreground text-xs">
                {entry.status}
              </span>
              <span className="min-w-0 truncate font-mono text-xs">
                {entry.path}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
