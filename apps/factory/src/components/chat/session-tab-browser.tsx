import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import { Input } from "@sfab-lite/ui/components/shadcn/input";
import { useAgent } from "agents/react";
import { Bookmark, ExternalLink, Home, RotateCw } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useConsoleRoute } from "@/hooks/use-console-route";
import { appQuickLinks } from "@/lib/chat/extract-app-routes";
import {
  appWorkspaceBasePath,
  clampToWorkspace,
  localhostDisplayPath,
  reloadWorkspaceFrame,
  stripLocalhostDisplay,
} from "@/lib/preview/reload-preview";

const ROUTER_FILE = "/src/ui/router.tsx";
const LOCATION_POLL_MS = 300;
const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";

interface WorkspaceBuildRpcStatus {
  error?: string | null;
  generation?: number | null;
  status?: string;
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

function toWorkspaceRelative(
  pathname: string,
  workspaceId: string
): string | null {
  const base = appWorkspaceBasePath(workspaceId);
  if (pathname === base || pathname === `${base}/`) {
    return "/";
  }
  if (pathname.startsWith(`${base}/`)) {
    const rest = pathname.slice(base.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return null;
}

function readFrameRelative(
  frame: HTMLIFrameElement,
  workspaceId: string
): string | null {
  try {
    const pathname = frame.contentWindow?.location.pathname;
    if (typeof pathname !== "string") {
      return null;
    }
    return toWorkspaceRelative(pathname, workspaceId);
  } catch {
    return null;
  }
}

function linkLabel(path: string): string {
  return path === "/" ? "Home" : path;
}

function rememberGeneration(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null }
): void {
  if (typeof status.generation === "number") {
    generationRef.current = status.generation;
  }
}

function applyReadyGeneration(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null }
): boolean {
  if (status.status !== "ready") {
    return false;
  }
  rememberGeneration(status, generationRef);
  return true;
}

function compilingHint(generationRef: { current: number | null }): string {
  return generationRef.current == null ? "Starting…" : "Updating…";
}

function hintForStatus(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null }
): string | null {
  if (status.status === "compiling") {
    return compilingHint(generationRef);
  }
  if (status.status === "error") {
    return status.error ?? "Workspace compile failed";
  }
  return null;
}

async function ensureWorkspaceBuildReady(
  agent: {
    ready: Promise<unknown>;
    call: (name: string, args: unknown[]) => Promise<unknown>;
  },
  generationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  onReady: () => void,
  isCancelled: () => boolean
): Promise<void> {
  await agent.ready;
  const status = (await agent.call(
    "workspaceBuildStatus",
    []
  )) as WorkspaceBuildRpcStatus;
  if (isCancelled()) {
    return;
  }
  rememberGeneration(status, generationRef);
  if (applyReadyGeneration(status, generationRef)) {
    setBuildHint(null);
    onReady();
    return;
  }
  if (generationRef.current != null) {
    onReady();
  }
  const hint = hintForStatus(status, generationRef);
  if (hint) {
    setBuildHint(hint);
  }
  if (status.status === "compiling" || status.status === "error") {
    return;
  }
  setBuildHint(compilingHint(generationRef));
  await agent.call("kickWorkspaceCompile", []);
  if (isCancelled()) {
    return;
  }
  const next = (await agent.call(
    "workspaceBuildStatus",
    []
  )) as WorkspaceBuildRpcStatus;
  if (isCancelled()) {
    return;
  }
  rememberGeneration(next, generationRef);
  if (applyReadyGeneration(next, generationRef)) {
    setBuildHint(null);
    onReady();
    return;
  }
  if (generationRef.current != null) {
    onReady();
  }
  const nextHint = hintForStatus(next, generationRef);
  if (nextHint) {
    setBuildHint(nextHint);
  }
}

function handleWorkspaceAgentMessage(
  data: string,
  generationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  onReady: () => void,
  refreshQuickLinks: () => void
): void {
  try {
    const parsed = JSON.parse(data) as {
      type?: string;
      generation?: number;
      status?: string;
      error?: string;
    };
    if (parsed.type === "workspace-change") {
      refreshQuickLinks();
      return;
    }
    if (parsed.type === "workspace-build-ready") {
      if (
        typeof parsed.generation === "number" &&
        parsed.generation === generationRef.current
      ) {
        return;
      }
      if (typeof parsed.generation === "number") {
        generationRef.current = parsed.generation;
      }
      setBuildHint(null);
      refreshQuickLinks();
      onReady();
      return;
    }
    if (parsed.type !== "workspace-build-status") {
      return;
    }
    if (parsed.status === "compiling") {
      setBuildHint(compilingHint(generationRef));
      return;
    }
    if (parsed.status === "error") {
      setBuildHint(parsed.error ?? "Workspace compile failed");
    }
  } catch {
    // Non-JSON frame.
  }
}

async function readWipQuickLinks(agent: {
  ready: Promise<unknown>;
  call: (name: string, args: unknown[]) => Promise<unknown>;
}): Promise<string[]> {
  await agent.ready;
  const content = (await agent.call("readFile", [ROUTER_FILE])) as
    | string
    | null;
  return appQuickLinks(content);
}

export function SessionTabBrowser({ active }: { active: boolean }) {
  const { workspaceId } = useConsoleRoute();

  if (!workspaceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">No workspace selected</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Open a workspace to preview its WIP build.
        </p>
      </div>
    );
  }

  return (
    <BrowserFrame active={active} key={workspaceId} workspaceId={workspaceId} />
  );
}

function BrowserFrame({
  active,
  workspaceId,
}: {
  active: boolean;
  workspaceId: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pathRef = useRef("/");
  const generationRef = useRef<number | null>(null);
  const frameMountedRef = useRef(false);
  const [path, setPath] = useState("/");
  const [draft, setDraft] = useState(localhostDisplayPath("/"));
  const [editing, setEditing] = useState(false);
  const [buildHint, setBuildHint] = useState<string | null>("Starting…");
  const [frameMounted, setFrameMounted] = useState(false);
  const [quickLinks, setQuickLinks] = useState<string[]>([]);
  const rootSrc = `${appWorkspaceBasePath(workspaceId)}/`;

  pathRef.current = path;

  const onBuildReady = useCallback(() => {
    if (frameMountedRef.current) {
      reloadWorkspaceFrame(iframeRef.current, workspaceId, pathRef.current);
      return;
    }
    frameMountedRef.current = true;
    setFrameMounted(true);
  }, [workspaceId]);

  const refreshQuickLinksRef = useRef<() => void>(() => undefined);

  const agent = useAgent({
    agent: "AppAgent",
    name: workspaceId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      handleWorkspaceAgentMessage(
        event.data,
        generationRef,
        setBuildHint,
        onBuildReady,
        () => refreshQuickLinksRef.current()
      );
    },
  });

  const refreshQuickLinks = useCallback(() => {
    fireAndForget(
      readWipQuickLinks(agent)
        .then((links) => {
          setQuickLinks(links);
        })
        .catch(() => {
          setQuickLinks([]);
        })
    );
  }, [agent]);

  refreshQuickLinksRef.current = refreshQuickLinks;

  useEffect(() => {
    refreshQuickLinks();
  }, [refreshQuickLinks]);

  useEffect(() => {
    let cancelled = false;
    fireAndForget(
      ensureWorkspaceBuildReady(
        agent,
        generationRef,
        setBuildHint,
        onBuildReady,
        () => cancelled
      ).catch((e) => {
        if (!cancelled) {
          setBuildHint(
            e instanceof Error ? e.message : "Workspace unavailable"
          );
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [agent, onBuildReady]);

  useEffect(() => {
    if (!active) {
      return;
    }

    let intervalId: number | null = null;

    const stop = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const tick = () => {
      if (editing) {
        return;
      }
      const frame = iframeRef.current;
      if (!frame) {
        return;
      }
      const next = readFrameRelative(frame, workspaceId);
      if (next != null) {
        setPath((current) => (current === next ? current : next));
      }
    };

    const sync = () => {
      if (document.visibilityState === "visible") {
        if (intervalId == null) {
          intervalId = window.setInterval(tick, LOCATION_POLL_MS);
        }
        return;
      }
      stop();
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, workspaceId, editing]);

  useEffect(() => {
    if (!editing) {
      setDraft(localhostDisplayPath(path));
    }
  }, [editing, path]);

  const navigateTo = (relative: string) => {
    const url = clampToWorkspace(workspaceId, relative);
    const frame = iframeRef.current;
    try {
      if (frame?.contentWindow) {
        frame.contentWindow.location.replace(url);
      } else if (frame) {
        frame.src = url;
      }
    } catch {
      if (frame) {
        frame.src = url;
      }
    }
    const absolute = new URL(url, window.location.origin);
    const next = toWorkspaceRelative(absolute.pathname, workspaceId);
    if (next != null) {
      setPath(next);
      setDraft(localhostDisplayPath(next));
    }
    setEditing(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigateTo(stripLocalhostDisplay(draft));
  };

  const reload = () => {
    const run = async () => {
      setBuildHint(compilingHint(generationRef));
      try {
        await agent.ready;
        await agent.call("kickWorkspaceCompile", []);
        const next = (await agent.call(
          "workspaceBuildStatus",
          []
        )) as WorkspaceBuildRpcStatus;
        if (applyReadyGeneration(next, generationRef)) {
          setBuildHint(null);
          onBuildReady();
          return;
        }
        const hint = hintForStatus(next, generationRef);
        setBuildHint(hint ?? compilingHint(generationRef));
      } catch (e) {
        setBuildHint(e instanceof Error ? e.message : "Reload failed");
      }
    };
    fireAndForget(run());
  };

  const openExternal = () => {
    window.open(
      clampToWorkspace(workspaceId, path),
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b bg-background px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            aria-label="Home"
            className="size-8 shrink-0"
            onClick={() => navigateTo("/")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Home className="size-4" />
          </Button>
          <Button
            aria-label="Reload"
            className="size-8 shrink-0"
            onClick={reload}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            aria-label="Open in new tab"
            className="size-8 shrink-0"
            onClick={openExternal}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ExternalLink className="size-4" />
          </Button>
          <form className="min-w-0 flex-1" onSubmit={onSubmit}>
            <Input
              aria-label="App path"
              className="h-8 font-mono text-xs"
              onBlur={() => {
                setEditing(false);
                setDraft(localhostDisplayPath(path));
              }}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                setEditing(true);
                setDraft(localhostDisplayPath(path));
              }}
              spellCheck={false}
              value={editing ? draft : localhostDisplayPath(path)}
            />
          </form>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Bookmarks"
                  className="size-8 shrink-0"
                  disabled={quickLinks.length === 0}
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <Bookmark className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {quickLinks.map((link) => (
                <DropdownMenuItem
                  className="font-mono text-xs"
                  key={link}
                  onClick={() => navigateTo(link)}
                >
                  {linkLabel(link)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {buildHint ? (
          <p className="px-1 text-[11px] text-muted-foreground">{buildHint}</p>
        ) : null}
      </div>
      {frameMounted ? (
        <iframe
          className="min-h-0 w-full flex-1 border-0 bg-background"
          ref={iframeRef}
          sandbox={IFRAME_SANDBOX}
          src={rootSrc}
          title="Workspace browser"
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
          <p className="text-muted-foreground text-sm">
            {buildHint ?? "Starting…"}
          </p>
        </div>
      )}
    </div>
  );
}
