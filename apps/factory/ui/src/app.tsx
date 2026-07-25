import { lazy, Suspense, useEffect } from "react";
import { authClient } from "./auth-client";
import { useRouter } from "./router";
import { AppDetailScreen } from "./screens/app-detail";
import { AppsListScreen } from "./screens/apps-list";
import { CreateAppScreen } from "./screens/create-app";
import { SignInScreen } from "./screens/sign-in";

const UiKitScreen = import.meta.env.DEV
  ? lazy(() =>
      import("./screens/ui-kit").then((m) => ({ default: m.UiKitScreen }))
    )
  : null;

export function App() {
  const { route, navigate } = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (
      !(isPending || signedIn) &&
      route.name !== "sign-in" &&
      !(import.meta.env.DEV && route.name === "ui-kit")
    ) {
      navigate({ name: "sign-in" }, true);
    }
  }, [isPending, signedIn, route.name, navigate]);

  if (import.meta.env.DEV && route.name === "ui-kit" && UiKitScreen) {
    return (
      <Suspense
        fallback={
          <main className="px-6 py-16 text-muted-foreground">Loading…</main>
        }
      >
        <UiKitScreen />
      </Suspense>
    );
  }

  if (isPending) {
    return (
      <main className="px-6 py-16 text-muted-foreground">Loading session…</main>
    );
  }

  if (route.name === "sign-in" || !signedIn) {
    return <SignInScreen />;
  }

  switch (route.name) {
    case "create":
      return <CreateAppScreen />;
    case "app":
      return <AppDetailScreen appId={route.appId} />;
    default:
      return <AppsListScreen />;
  }
}
