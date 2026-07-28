import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps")({
  ssr: false,
  component: () => null,
});
