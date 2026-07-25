import { lazy, Suspense, useEffect } from "react";
import { authClient } from "./auth-client";
import { ChatScreen } from "./features/chat/page";
import { useRouter } from "./router";
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
  const devChat = import.meta.env.DEV && route.name === "dev-chat";

  useEffect(() => {
    if (
      !(isPending || signedIn) &&
      route.name !== "sign-in" &&
      !(import.meta.env.DEV && route.name === "ui-kit") &&
      !devChat
    ) {
      navigate({ name: "sign-in" }, true);
    }
  }, [isPending, signedIn, route.name, navigate, devChat]);

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

  if (devChat) {
    return <ChatScreen />;
  }

  if (isPending) {
    return (
      <main className="px-6 py-16 text-muted-foreground">Loading session…</main>
    );
  }

  if (route.name === "sign-in" || !signedIn) {
    return <SignInScreen />;
  }

  if (route.name === "create") {
    return <CreateAppScreen />;
  }

  return <ChatScreen />;
}
