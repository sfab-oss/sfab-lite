import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLayout } from "./components/layout/app-shell";
import { QueryProvider } from "./components/providers/query-provider";
import { loadSession } from "./hooks/use-session";
import { publicBase } from "./lib/public-base";
import { BalancesPage } from "./routes/balances";
import { LandingPage } from "./routes/landing";
import { OnboardingPage } from "./routes/onboarding";
import { OverviewPage } from "./routes/overview";
import { PartiesPage } from "./routes/parties";
import { PartyDetailPage } from "./routes/party-detail";
import { SettingsPage } from "./routes/settings";
import { SignInPage } from "./routes/sign-in";
import { SignUpPage } from "./routes/sign-up";
import "./styles.css";

const TRAILING_SLASH = /\/$/;

function Root() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({ component: Root });

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  component: SignInPage,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  component: SignUpPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: async () => {
    const session = await loadSession();
    if (!session.authenticated) {
      throw redirect({ to: "/sign-in" });
    }
    if (!session.needsOnboarding) {
      throw redirect({ to: "/overview" });
    }
  },
  component: OnboardingPage,
});

async function requireSession() {
  const session = await loadSession();
  if (!session.authenticated) {
    throw redirect({ to: "/sign-in" });
  }
  if (session.needsOnboarding) {
    throw redirect({ to: "/onboarding" });
  }
}

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_app",
  beforeLoad: requireSession,
  component: AppLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/overview",
  component: OverviewPage,
});

const partiesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/parties",
  component: PartiesPage,
});

const partyDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/parties/$id",
  component: PartyDetailPage,
});

const balancesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/balances",
  component: BalancesPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  signInRoute,
  signUpRoute,
  onboardingRoute,
  appLayoutRoute.addChildren([
    overviewRoute,
    partiesRoute,
    partyDetailRoute,
    balancesRoute,
    settingsRoute,
  ]),
]);

function routerBasepath(): string {
  if (!publicBase) {
    return "/";
  }
  try {
    const path = new URL(publicBase).pathname.replace(TRAILING_SLASH, "");
    return path.length > 0 ? path : "/";
  } catch {
    return "/";
  }
}

export const router = createRouter({
  routeTree,
  basepath: routerBasepath(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

createRoot(root).render(
  <StrictMode>
    <QueryProvider>
      <RouterProvider router={router} />
    </QueryProvider>
  </StrictMode>
);
