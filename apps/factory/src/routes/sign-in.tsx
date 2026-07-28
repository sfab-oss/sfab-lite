import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/signin", replace: true });
  },
});
