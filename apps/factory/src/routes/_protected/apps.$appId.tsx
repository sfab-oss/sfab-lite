import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId")({
  ssr: false,
  component: () => null,
});
