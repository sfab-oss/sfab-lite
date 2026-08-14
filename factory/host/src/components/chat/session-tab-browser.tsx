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

const ROUTER_FILE = "/src/router.tsx";
const LOCATION_POLL_MS = 300;
const BUILD_STATUS_POLL_MS = 400;
const BUILD_STATUS_POLL_MAX_MS = 45_000;
/** Catches ready builds when both workspace-change and build-ready WS are missed. */
const BUILD_GENERATION_HEARTBEAT_MS = 2000;
const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";

interface WorkspaceBuildRpcStatus {
  error?: string | null;
  generation?: number | null;
  status?: string;
}

interface AgentRpc {
  ready: Promise<unknown>;
  call: (name: string, args: unknown[]) => Promise<unknown>;
}

function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function applyReadyFromPoll(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null },
  loadedGenerationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  reloadFrame: () => void,
  reloadIfAlreadyLoaded: boolean
): "done" | "continue" {
  if (status.status === "error") {
    setBuildHint(status.error ?? "Workspace compile failed");
    return "done";
  }
  if (status.status !== "ready") {
    setBuildHint(compilingHint(generationRef));
    return "continue";
  }
  const gen = typeof status.generation === "number" ? status.generation : null;
  rememberGeneration(status, generationRef);
  setBuildHint(null);
  if (
    gen != null &&
    (gen !== loadedGenerationRef.current || reloadIfAlreadyLoaded)
  ) {
    loadedGenerationRef.current = gen;
    reloadFrame();
  } else if (gen != null) {
    loadedGenerationRef.current = gen;
  }
  return "done";
}

/**
 * Poll workspaceBuildStatus until ready/error. Used as a fallback when the
 * WebSocket `workspace-build-ready` message is missed — without this the
 * Browser can stick on "Updating…" with a stale iframe.
 */
async function pollUntilBuildReady(
  agent: AgentRpc,
  generationRef: { current: number | null },
  loadedGenerationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  reloadFrame: () => void,
  isCancelled: () => boolean,
  options: { kick: boolean; reloadIfAlreadyLoaded: boolean }
): Promise<void> {
  await agent.ready;
  if (isCancelled()) {
    return;
  }
  if (options.kick) {
    await agent.call("kickWorkspaceCompile", []);
    if (isCancelled()) {
      return;
    }
  }

  const started = Date.now();
  while (!isCancelled()) {
    const status = (await agent.call(
      "workspaceBuildStatus",
      []
    )) as WorkspaceBuildRpcStatus;
    if (isCancelled()) {
      return;
    }
    const step = applyReadyFromPoll(
      status,
      generationRef,
      loadedGenerationRef,
      setBuildHint,
      reloadFrame,
      options.reloadIfAlreadyLoaded
    );
    if (step === "done") {
      return;
    }
    if (Date.now() - started >= BUILD_STATUS_POLL_MAX_MS) {
      setBuildHint("Workspace compile timed out");
      return;
    }
    await sleep(BUILD_STATUS_POLL_MS);
  }
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

/**
 * One heartbeat tick: if the DO has a newer ready generation than the iframe,
 * reload. If compiling, escalate to the fast poll. No-op when already current.
 */
function applyHeartbeatStatus(
  status: WorkspaceBuildRpcStatus,
  generationRef: { current: number | null },
  loadedGenerationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  reloadFrame: () => void,
  startBuildPoll: () => void
): void {
  if (status.status === "compiling") {
    setBuildHint(compilingHint(generationRef));
    startBuildPoll();
    return;
  }
  if (status.status === "error") {
    setBuildHint(status.error ?? "Workspace compile failed");
    return;
  }
  if (status.status !== "ready") {
    return;
  }
  const gen = typeof status.generation === "number" ? status.generation : null;
  rememberGeneration(status, generationRef);
  if (gen == null || gen === loadedGenerationRef.current) {
    return;
  }
  loadedGenerationRef.current = gen;
  setBuildHint(null);
  reloadFrame();
}

async function ensureWorkspaceBuildReady(
  agent: AgentRpc,
  generationRef: { current: number | null },
  loadedGenerationRef: { current: number | null },
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
  rememberGeneration(status, generationRef);
  if (applyReadyGeneration(status, generationRef)) {
    if (typeof status.generation === "number") {
      loadedGenerationRef.current = status.generation;
    }
    setBuildHint(null);
    return;
  }
  const hint = hintForStatus(status, generationRef);
  if (hint) {
    setBuildHint(hint);
  }
  if (status.status === "error") {
    return;
  }
  // compiling or idle — poll (kick only when idle so we don't double-schedule)
  await pollUntilBuildReady(
    agent,
    generationRef,
    loadedGenerationRef,
    setBuildHint,
    reloadFrame,
    isCancelled,
    { kick: status.status !== "compiling", reloadIfAlreadyLoaded: false }
  );
}

function handleWorkspaceAgentMessage(
  data: string,
  generationRef: { current: number | null },
  loadedGenerationRef: { current: number | null },
  setBuildHint: (hint: string | null) => void,
  reloadFrame: () => void,
  refreshQuickLinks: () => void,
  startBuildPoll: () => void
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
      // Write landed — compile is scheduled on the DO; poll in case ready WS is missed.
      startBuildPoll();
      return;
    }
    if (parsed.type === "workspace-build-ready") {
      if (
        typeof parsed.generation === "number" &&
        parsed.generation === loadedGenerationRef.current
      ) {
        setBuildHint(null);
        return;
      }
      if (typeof parsed.generation === "number") {
        generationRef.current = parsed.generation;
        loadedGenerationRef.current = parsed.generation;
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
      setBuildHint(compilingHint(generationRef));
      startBuildPoll();
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
  const loadedGenerationRef = useRef<number | null>(null);
  const pollEpochRef = useRef(0);
  const [path, setPath] = useState("/");
  const [draft, setDraft] = useState(localhostDisplayPath("/"));
  const [editing, setEditing] = useState(false);
  const [buildHint, setBuildHint] = useState<string | null>("Starting…");
  const [quickLinks, setQuickLinks] = useState<string[]>([]);
  const rootSrc = `${appWorkspaceBasePath(workspaceId)}/`;

  pathRef.current = path;

  const reloadFrame = useCallback(() => {
    reloadWorkspaceFrame(iframeRef.current, workspaceId, pathRef.current);
  }, [workspaceId]);

  const refreshQuickLinksRef = useRef<() => void>(() => undefined);
  const startBuildPollRef = useRef<() => void>(() => undefined);

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
        loadedGenerationRef,
        setBuildHint,
        reloadFrame,
        () => refreshQuickLinksRef.current(),
        () => startBuildPollRef.current()
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

  const startBuildPoll = useCallback(() => {
    const epoch = ++pollEpochRef.current;
    fireAndForget(
      pollUntilBuildReady(
        agent,
        generationRef,
        loadedGenerationRef,
        setBuildHint,
        reloadFrame,
        () => epoch !== pollEpochRef.current,
        { kick: false, reloadIfAlreadyLoaded: false }
      )
    );
  }, [agent, reloadFrame]);

  startBuildPollRef.current = startBuildPoll;

  useEffect(() => {
    refreshQuickLinks();
  }, [refreshQuickLinks]);

  useEffect(() => {
    const epoch = ++pollEpochRef.current;
    fireAndForget(
      ensureWorkspaceBuildReady(
        agent,
        generationRef,
        loadedGenerationRef,
        setBuildHint,
        reloadFrame,
        () => epoch !== pollEpochRef.current
      ).catch((e) => {
        if (epoch === pollEpochRef.current) {
          setBuildHint(
            e instanceof Error ? e.message : "Workspace unavailable"
          );
        }
      })
    );
    return () => {
      pollEpochRef.current += 1;
    };
  }, [agent, reloadFrame]);

  // Slow heartbeat: WS can drop both change and ready; still pick up new gens.
  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const tick = () => {
      fireAndForget(
        (async () => {
          await agent.ready;
          if (cancelled || document.visibilityState !== "visible") {
            return;
          }
          const status = (await agent.call(
            "workspaceBuildStatus",
            []
          )) as WorkspaceBuildRpcStatus;
          if (cancelled) {
            return;
          }
          applyHeartbeatStatus(
            status,
            generationRef,
            loadedGenerationRef,
            setBuildHint,
            reloadFrame,
            startBuildPoll
          );
        })()
      );
    };

    const sync = () => {
      if (document.visibilityState === "visible") {
        if (intervalId == null) {
          intervalId = window.setInterval(tick, BUILD_GENERATION_HEARTBEAT_MS);
        }
        return;
      }
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, agent, reloadFrame, startBuildPoll]);

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
    const epoch = ++pollEpochRef.current;
    setBuildHint(compilingHint(generationRef));
    fireAndForget(
      pollUntilBuildReady(
        agent,
        generationRef,
        loadedGenerationRef,
        setBuildHint,
        reloadFrame,
        () => epoch !== pollEpochRef.current,
        { kick: true, reloadIfAlreadyLoaded: true }
      ).catch((e) => {
        if (epoch === pollEpochRef.current) {
          setBuildHint(e instanceof Error ? e.message : "Reload failed");
        }
      })
    );
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
