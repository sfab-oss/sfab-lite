import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Input } from "@sfab-lite/ui/components/shadcn/input";
import { cn } from "@sfab-lite/ui/lib/utils";
import { useAgent } from "agents/react";
import { ExternalLink, Home, RotateCw } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  appWorkspaceBasePath,
  clampToApp,
  localhostDisplayPath,
  reloadPreviewFrame,
  stripLocalhostDisplay,
} from "@/features/preview/reload-preview";
import { useChatData } from "../data/chat-data-context";
import { appQuickLinks } from "../lib/extract-app-routes";

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

function toWorkspaceRelative(pathname: string, appId: string): string | null {
  const base = appWorkspaceBasePath(appId);
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
  appId: string
): string | null {
  try {
    const pathname = frame.contentWindow?.location.pathname;
    if (typeof pathname !== "string") {
      return null;
    }
    return toWorkspaceRelative(pathname, appId);
  } catch {
    return null;
  }
}

function linkLabel(path: string): string {
  return path === "/" ? "Home" : path;
}

function applyReadyGeneration(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null }
): boolean {
  if (status.status !== "ready") {
    return false;
  }
  if (typeof status.generation === "number") {
    generationRef.current = status.generation;
  }
  return true;
}

function hintForStatus(status: WorkspaceBuildRpcStatus): string | null {
  if (status.status === "compiling") {
    return "Compiling workspace…";
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
  reloadFrame: () => void,
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
  if (applyReadyGeneration(status, generationRef)) {
    setBuildHint(null);
    return;
  }
  const hint = hintForStatus(status);
  if (hint) {
    setBuildHint(hint);
  }
  if (status.status === "compiling") {
    return;
  }
  const next = (await agent.call(
    "compileWorkspaceNow",
    []
  )) as WorkspaceBuildRpcStatus;
  if (isCancelled()) {
    return;
  }
  if (applyReadyGeneration(next, generationRef)) {
    setBuildHint(null);
    reloadFrame();
    return;
  }
  setBuildHint(next.error ?? "Workspace compile failed");
}

function handleWorkspaceAgentMessage(
  data: string,
  generationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  reloadFrame: () => void,
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
      reloadFrame();
      return;
    }
    if (parsed.type !== "workspace-build-status") {
      return;
    }
    if (parsed.status === "compiling") {
      setBuildHint("Compiling workspace…");
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
  const data = useChatData();
  const appId = data.getAppId();

  if (!appId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">No app selected</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Open a conversation for an app to preview its workspace.
        </p>
      </div>
    );
  }

  return <BrowserFrame active={active} appId={appId} key={appId} />;
}

function BrowserFrame({ active, appId }: { active: boolean; appId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pathRef = useRef("/");
  const generationRef = useRef<number | null>(null);
  const [path, setPath] = useState("/");
  const [draft, setDraft] = useState(localhostDisplayPath("/"));
  const [editing, setEditing] = useState(false);
  const [buildHint, setBuildHint] = useState<string | null>("Preparing…");
  const [quickLinks, setQuickLinks] = useState<string[]>([]);
  const rootSrc = `${appWorkspaceBasePath(appId)}/`;

  pathRef.current = path;

  const reloadFrame = useCallback(() => {
    reloadPreviewFrame(iframeRef.current, appId, pathRef.current, "workspace");
  }, [appId]);

  const refreshQuickLinksRef = useRef<() => void>(() => undefined);

  const agent = useAgent({
    agent: "AppAgent",
    name: appId,
    onMessage: (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      handleWorkspaceAgentMessage(
        event.data,
        generationRef,
        setBuildHint,
        reloadFrame,
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
        reloadFrame,
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
  }, [agent, reloadFrame]);

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
      const next = readFrameRelative(frame, appId);
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
  }, [active, appId, editing]);

  useEffect(() => {
    if (!editing) {
      setDraft(localhostDisplayPath(path));
    }
  }, [editing, path]);

  const navigateTo = (relative: string) => {
    const url = clampToApp(appId, relative, "workspace");
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
    const next = toWorkspaceRelative(absolute.pathname, appId);
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
      setBuildHint("Compiling workspace…");
      try {
        await agent.ready;
        const next = (await agent.call(
          "compileWorkspaceNow",
          []
        )) as WorkspaceBuildRpcStatus;
        if (applyReadyGeneration(next, generationRef)) {
          setBuildHint(null);
          reloadFrame();
          return;
        }
        setBuildHint(next.error ?? "Workspace compile failed");
      } catch (e) {
        setBuildHint(e instanceof Error ? e.message : "Reload failed");
      }
    };
    fireAndForget(run());
  };

  const openExternal = () => {
    window.open(
      clampToApp(appId, path, "workspace"),
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
        </div>
        {buildHint ? (
          <p className="px-1 text-[11px] text-muted-foreground">{buildHint}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 px-1">
          {quickLinks.map((link) => (
            <button
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                path === link && "bg-muted text-foreground"
              )}
              key={link}
              onClick={() => navigateTo(link)}
              type="button"
            >
              {linkLabel(link)}
            </button>
          ))}
        </div>
      </div>
      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-background"
        ref={iframeRef}
        sandbox={IFRAME_SANDBOX}
        src={rootSrc}
        title="Workspace browser"
      />
    </div>
  );
}
