import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { publicBase } from "./lib/public-base";
import { loadSession } from "./lib/session";
import { CatalogPage } from "./routes/catalog";
import { DocumentDetailPage } from "./routes/document-detail";
import { DocumentsPage } from "./routes/documents";
import { EntitiesPage } from "./routes/entities";
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

/**
 * The landing page for a signed-in operator. `requireSession` is a hoisted
 * function declaration, so referring to it above its definition is fine.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: requireSession,
  component: OverviewPage,
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
      throw redirect({ to: "/documents" });
    }
  },
  component: OnboardingPage,
});

/**
 * What every signed-in page requires, written once. A pathless layout route
 * would express the same thing, but it also prefixes each child's id — and
 * those ids are what `useParams({ from })` is typed against, so the pages
 * would all have to name a route segment that does not exist in any URL.
 */
async function requireSession() {
  const session = await loadSession();
  if (!session.authenticated) {
    throw redirect({ to: "/sign-in" });
  }
  if (session.needsOnboarding) {
    throw redirect({ to: "/onboarding" });
  }
}

const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents",
  beforeLoad: requireSession,
  component: DocumentsPage,
});

const documentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents/$id",
  beforeLoad: requireSession,
  component: DocumentDetailPage,
});

const entitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entities",
  beforeLoad: requireSession,
  component: EntitiesPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/catalog",
  beforeLoad: requireSession,
  component: CatalogPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: requireSession,
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  onboardingRoute,
  documentsRoute,
  documentDetailRoute,
  entitiesRoute,
  catalogRoute,
  settingsRoute,
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
