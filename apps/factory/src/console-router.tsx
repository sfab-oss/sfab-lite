import { useRouter as useTanStackRouter } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo } from "react";

/**
 * Console route names preserved from the pre-Start client router so chat and
 * screens can keep a small navigate/Link surface while URLs are owned by
 * TanStack file routes.
 */
export type Route =
  | { name: "sign-in" }
  | { name: "chat" }
  | { name: "apps" }
  | { name: "thread"; appId: string; threadId: string }
  | { name: "app"; appId: string }
  | { name: "mcp-consent" }
  | { name: "ui-kit" }
  | { name: "dev-chat"; appId?: string; threadId?: string };

const RE_APP = /^\/apps\/([^/]+)$/;
const RE_THREAD = /^\/apps\/([^/]+)\/t\/([^/]+)$/;
const RE_DEV_CHAT_THREAD = /^\/dev\/chat\/apps\/([^/]+)\/t\/([^/]+)$/;
const RE_TRAILING_SLASHES = /\/+$/;

function parsePath(pathname: string): Route {
  const path = pathname.replace(RE_TRAILING_SLASHES, "") || "/";
  if (path === "/signin" || path === "/sign-in") {
    return { name: "sign-in" };
  }
  if (path === "/mcp/consent") {
    return { name: "mcp-consent" };
  }
  if (import.meta.env.DEV && path === "/dev/ui") {
    return { name: "ui-kit" };
  }
  if (import.meta.env.DEV) {
    const devThread = path.match(RE_DEV_CHAT_THREAD);
    if (devThread?.[1] && devThread[2]) {
      return {
        name: "dev-chat",
        appId: decodeURIComponent(devThread[1]),
        threadId: decodeURIComponent(devThread[2]),
      };
    }
    if (path === "/dev/chat") {
      return { name: "dev-chat" };
    }
  }
  const threadMatch = path.match(RE_THREAD);
  if (threadMatch?.[1] && threadMatch[2]) {
    return {
      name: "thread",
      appId: decodeURIComponent(threadMatch[1]),
      threadId: decodeURIComponent(threadMatch[2]),
    };
  }
  const appMatch = path.match(RE_APP);
  if (appMatch?.[1]) {
    return { name: "app", appId: decodeURIComponent(appMatch[1]) };
  }
  if (path === "/" || path === "/chat") {
    return { name: "chat" };
  }
  if (path === "/apps") {
    return { name: "apps" };
  }
  return { name: "chat" };
}

function pathFor(route: Route): string {
  switch (route.name) {
    case "sign-in":
      return "/signin";
    case "mcp-consent":
      return "/mcp/consent";
    case "ui-kit":
      return "/dev/ui";
    case "dev-chat":
      return route.appId && route.threadId
        ? `/dev/chat/apps/${encodeURIComponent(route.appId)}/t/${encodeURIComponent(route.threadId)}`
        : "/dev/chat";
    case "app":
      return `/apps/${encodeURIComponent(route.appId)}`;
    case "thread":
      return `/apps/${encodeURIComponent(route.appId)}/t/${encodeURIComponent(route.threadId)}`;
    case "apps":
      return "/apps";
    default:
      return "/";
  }
}

interface RouterValue {
  route: Route;
  navigate: (route: Route, replace?: boolean) => void;
}

export function useRouter(): RouterValue {
  const router = useTanStackRouter();
  const pathname = router.state.location.pathname;
  const route = useMemo(() => parsePath(pathname), [pathname]);

  const navigate = useCallback(
    (next: Route, replace = false) => {
      const path = pathFor(next);
      if (replace) {
        router.history.replace(path);
      } else {
        router.history.push(path);
      }
    },
    [router]
  );

  return { route, navigate };
}

export function Link({
  to,
  children,
  className,
}: {
  to: Route;
  children: ReactNode;
  className?: string;
}) {
  const { navigate } = useRouter();
  return (
    <a
      href={pathFor(to)}
      className={className}
      onClick={(e) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
