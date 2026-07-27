import { ExternalLink, Home, RotateCw } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useChatData } from "../data/chat-data-context";
import { appQuickLinks } from "../lib/extract-app-routes";

const ROUTER_FILE = "src/ui/router.tsx";
const LOCATION_POLL_MS = 300;
const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";
const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LEADING_SLASH = /^\//;

function appBasePath(appId: string): string {
  return `/a/${encodeURIComponent(appId)}`;
}

function toAppRelative(pathname: string, appId: string): string | null {
  const base = appBasePath(appId);
  if (pathname === base || pathname === `${base}/`) {
    return "/";
  }
  if (pathname.startsWith(`${base}/`)) {
    const rest = pathname.slice(base.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return null;
}

function clampToApp(appId: string, input: string): string {
  const base = appBasePath(appId);
  try {
    let rel = input.trim() || "/";
    if (ABSOLUTE_URL.test(rel) || rel.startsWith("//")) {
      return `${base}/`;
    }
    if (rel === base || rel === `${base}/` || rel.startsWith(`${base}/`)) {
      rel = rel.slice(base.length) || "/";
    }
    if (!rel.startsWith("/")) {
      rel = `/${rel}`;
    }
    const resolved = new URL(
      rel.replace(LEADING_SLASH, ""),
      `https://x.invalid${base}/`
    );
    if (
      resolved.pathname !== base &&
      !resolved.pathname.startsWith(`${base}/`)
    ) {
      return `${base}/`;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return `${base}/`;
  }
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
    return toAppRelative(pathname, appId);
  } catch {
    return null;
  }
}

function linkLabel(path: string): string {
  return path === "/" ? "Home" : path;
}

export function SessionTabBrowser({ threadId }: { threadId: string }) {
  const data = useChatData();
  const appId =
    data.listThreads().find((thread) => thread.id === threadId)?.appId ?? null;
  const liveVersion = data.listVersions().find((version) => version.live);
  const routerSource = data.getWorkspaceFile(ROUTER_FILE)?.content ?? null;
  const quickLinks = appQuickLinks(routerSource);

  if (!(appId && liveVersion)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">No published version yet</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          The live app appears here once a version is published.
        </p>
      </div>
    );
  }

  return (
    <BrowserFrame appId={appId} key={liveVersion.id} quickLinks={quickLinks} />
  );
}

function BrowserFrame({
  appId,
  quickLinks,
}: {
  appId: string;
  quickLinks: string[];
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [path, setPath] = useState("/");
  const [draft, setDraft] = useState("/");
  const [editing, setEditing] = useState(false);
  const rootSrc = `${appBasePath(appId)}/`;

  useEffect(() => {
    const id = window.setInterval(() => {
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
    }, LOCATION_POLL_MS);
    return () => window.clearInterval(id);
  }, [appId, editing]);

  useEffect(() => {
    if (!editing) {
      setDraft(path);
    }
  }, [editing, path]);

  const navigateTo = (relative: string) => {
    const url = clampToApp(appId, relative);
    const frame = iframeRef.current;
    try {
      if (frame?.contentWindow) {
        frame.contentWindow.location.assign(url);
      } else if (frame) {
        frame.src = url;
      }
    } catch {
      if (frame) {
        frame.src = url;
      }
    }
    const absolute = new URL(url, window.location.origin);
    const next = toAppRelative(absolute.pathname, appId);
    if (next != null) {
      setPath(next);
      setDraft(next);
    }
    setEditing(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigateTo(draft);
  };

  const reload = () => {
    try {
      iframeRef.current?.contentWindow?.location.reload();
    } catch {
      const frame = iframeRef.current;
      if (frame) {
        frame.src = clampToApp(appId, path);
      }
    }
  };

  const openExternal = () => {
    window.open(clampToApp(appId, path), "_blank", "noopener,noreferrer");
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
                setDraft(path);
              }}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                setEditing(true);
                setDraft(path);
              }}
              spellCheck={false}
              value={editing ? draft : path}
            />
          </form>
        </div>
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
        title="App browser"
      />
    </div>
  );
}
