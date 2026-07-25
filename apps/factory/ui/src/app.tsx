import { useEffect } from "react";
import { authClient } from "./auth-client";
import { useRouter } from "./router";
import { AppDetailScreen } from "./screens/app-detail";
import { AppsListScreen } from "./screens/apps-list";
import { CreateAppScreen } from "./screens/create-app";
import { SignInScreen } from "./screens/sign-in";
import { UiKitScreen } from "./screens/ui-kit";

export function App() {
  const { route, navigate } = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    if (
      !(isPending || signedIn) &&
      route.name !== "sign-in" &&
      route.name !== "ui-kit"
    ) {
      navigate({ name: "sign-in" }, true);
    }
  }, [isPending, signedIn, route.name, navigate]);

  if (route.name === "ui-kit") {
    return <UiKitScreen />;
  }

  if (isPending) {
    return (
      <main className="px-6 py-16 text-[var(--muted)]">Loading session…</main>
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
