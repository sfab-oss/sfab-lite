import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type Route =
  | { name: "sign-in" }
  | { name: "apps" }
  | { name: "create" }
  | { name: "app"; appId: string }
  | { name: "ui-kit" };

const RE_APP = /^\/apps\/([^/]+)$/;
const RE_TRAILING_SLASHES = /\/+$/;

function parsePath(pathname: string): Route {
  const path = pathname.replace(RE_TRAILING_SLASHES, "") || "/";
  if (path === "/signin" || path === "/sign-in") {
    return { name: "sign-in" };
  }
  if (import.meta.env.DEV && path === "/dev/ui") {
    return { name: "ui-kit" };
  }
  if (path === "/apps/new" || path === "/create") {
    return { name: "create" };
  }
  const appMatch = path.match(RE_APP);
  if (appMatch?.[1]) {
    return { name: "app", appId: decodeURIComponent(appMatch[1]) };
  }
  if (path === "/" || path === "/apps") {
    return { name: "apps" };
  }
  // Unknown paths still render as apps list; the SPA shell already matched.
  return { name: "apps" };
}

function pathFor(route: Route): string {
  switch (route.name) {
    case "sign-in":
      return "/signin";
    case "ui-kit":
      return "/dev/ui";
    case "create":
      return "/apps/new";
    case "app":
      return `/apps/${encodeURIComponent(route.appId)}`;
    default:
      return "/apps";
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
