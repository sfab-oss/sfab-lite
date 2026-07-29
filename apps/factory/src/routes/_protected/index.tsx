import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/apps", replace: true });
  },
  component: () => null,
});
