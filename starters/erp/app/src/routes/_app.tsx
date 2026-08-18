import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppLayout } from "../components/layout/app-shell";
import { loadSession } from "../hooks/use-session";

async function requireSession() {
  const session = await loadSession();
  if (!session.authenticated) {
    throw redirect({ to: "/sign-in" });
  }
  if (session.needsOnboarding) {
    throw redirect({ to: "/onboarding" });
  }
}

export const Route = createFileRoute("/_app")({
  beforeLoad: requireSession,
  component: AppLayout,
});
