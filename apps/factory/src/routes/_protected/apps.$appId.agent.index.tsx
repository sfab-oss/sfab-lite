import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId/agent/")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/apps/$appId/work",
      params: { appId: params.appId },
      replace: true,
    });
  },
  component: () => null,
});
