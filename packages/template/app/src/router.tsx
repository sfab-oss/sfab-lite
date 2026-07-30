import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AppLayout } from "./components/layout/app-shell";
import { loadSession } from "./hooks/use-session";
import { publicBase } from "./lib/public-base";
import { CatalogPage } from "./routes/catalog";
import { DocumentDetailPage } from "./routes/document-detail";
import { DocumentsPage } from "./routes/documents";
import { EntitiesPage } from "./routes/entities";
import { LandingPage } from "./routes/landing";
import { OnboardingPage } from "./routes/onboarding";
import { OverviewPage } from "./routes/overview";
import { SettingsPage } from "./routes/settings";
import { SignInPage } from "./routes/sign-in";
import { SignUpPage } from "./routes/sign-up";

const TRAILING_SLASH = /\/$/;

/**
 * Routes are declared in code (no file-based route generation), so this file
 * is the whole map. Guards read the session through the query cache, which
 * means one request serves the guard and the page it guards.
 */
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

/**
 * Everything behind a session, sharing one mount of the sidebar chrome. It is
 * pathless — `_app` names no URL segment — which is what lets the sidebar
 * survive navigation between its children instead of remounting per page.
 *
 * The id still prefixes each child's, so `useParams({ from })` names
 * `/_app/documents/$id` rather than `/documents/$id`.
 */
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

const documentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/documents",
  component: DocumentsPage,
});

const documentDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/documents/$id",
  component: DocumentDetailPage,
});

const entitiesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/entities",
  component: EntitiesPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/catalog",
  component: CatalogPage,
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
    documentsRoute,
    documentDetailRoute,
    entitiesRoute,
    catalogRoute,
    settingsRoute,
  ]),
]);

/**
 * When the factory serves under `/a/:appId`, `__SFAB_PUBLIC_BASE__` is the
 * mount URL. TanStack Router must strip that prefix or every path looks like
 * `/a/…/sign-in` and the tree reports Not Found.
 */
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
