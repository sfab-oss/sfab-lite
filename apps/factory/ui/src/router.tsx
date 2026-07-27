import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type Route =
  | { name: "sign-in" }
  | { name: "chat" }
  | { name: "apps" }
  | { name: "thread"; appId: string; threadId: string }
  | { name: "app"; appId: string }
  | { name: "create" }
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
  if (path === "/apps/new" || path === "/create") {
    return { name: "create" };
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
    case "ui-kit":
      return "/dev/ui";
    case "dev-chat":
      return route.appId && route.threadId
        ? `/dev/chat/apps/${encodeURIComponent(route.appId)}/t/${encodeURIComponent(route.threadId)}`
        : "/dev/chat";
    case "create":
      return "/apps/new";
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

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    parsePath(window.location.pathname)
  );

  useEffect(() => {
    const onPop = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (next: Route, replace = false) => {
    const path = pathFor(next);
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setRoute(next);
  };

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter requires RouterProvider");
  }
  return ctx;
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
