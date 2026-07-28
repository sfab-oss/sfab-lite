import { lazy, Suspense, useEffect } from "react";
import { authClient } from "./auth-client";
import { useRouter } from "./router";
import { AppDetailScreen } from "./screens/app-detail";
import { AppsListScreen } from "./screens/apps-list";
import { McpConsentScreen } from "./screens/mcp-consent";
import { SignInScreen } from "./screens/sign-in";

const UiKitScreen = import.meta.env.DEV
  ? lazy(() =>
      import("./screens/ui-kit").then((m) => ({ default: m.UiKitScreen }))
    )
  : null;

const ChatScreen = lazy(() =>
  import("./features/chat/page").then((m) => ({ default: m.ChatScreen }))
);

function ChatFallback() {
  return (
    <main className="px-6 py-16 text-muted-foreground">Loading chat…</main>
  );
}

export function App() {
  const { route, navigate } = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const devChat = import.meta.env.DEV && route.name === "dev-chat";
  // Consent owns its own signed-out state: bouncing to `/signin` would drop
  // the signed authorization query this screen exists to hand back.
  const consent = route.name === "mcp-consent";

  useEffect(() => {
    if (
      !(isPending || signedIn) &&
      route.name !== "sign-in" &&
      !(import.meta.env.DEV && route.name === "ui-kit") &&
      !(devChat || consent)
    ) {
      navigate({ name: "sign-in" }, true);
    }
  }, [isPending, signedIn, route.name, navigate, devChat, consent]);

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
    return (
      <Suspense fallback={<ChatFallback />}>
        <ChatScreen />
      </Suspense>
    );
  }

  if (consent) {
    return <McpConsentScreen />;
  }

  if (isPending) {
    return (
      <main className="px-6 py-16 text-muted-foreground">Loading session…</main>
    );
  }

  if (route.name === "sign-in" || !signedIn) {
    return <SignInScreen />;
  }

  if (route.name === "apps") {
    return <AppsListScreen />;
  }

  if (route.name === "app") {
    return <AppDetailScreen appId={route.appId} />;
  }

  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatScreen />
    </Suspense>
  );
}
