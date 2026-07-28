import { lazy, Suspense, useEffect } from "react";
import { authClient } from "./auth-client";
import { ConsoleShellSkeleton } from "./components/brand/console-shell-skeleton";
import { Skeleton } from "./components/ui/skeleton";
import { useRouter } from "./router";
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

/**
 * Session is still unknown — paint neither console nor sign-in form, so a
 * signed-out visitor does not flash the wrong chrome. Brand mark only.
 */
function SessionBoot() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-muted/40 p-6"
      role="status"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="size-8 rounded-lg" />
      <Skeleton className="h-5 w-20" />
    </div>
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
      <Suspense fallback={<ConsoleShellSkeleton />}>
        <UiKitScreen />
      </Suspense>
    );
  }

  if (devChat) {
    return (
      <Suspense fallback={<ConsoleShellSkeleton />}>
        <ChatScreen />
      </Suspense>
    );
  }

  if (consent) {
    return <McpConsentScreen />;
  }

  if (isPending) {
    return <SessionBoot />;
  }

  if (route.name === "sign-in" || !signedIn) {
    return <SignInScreen />;
  }

  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <ChatScreen />
    </Suspense>
  );
}
