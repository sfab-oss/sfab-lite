import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/apps/$appId/t/$threadId")({
  ssr: false,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/apps/$appId/work/$threadId",
      params: {
        appId: params.appId,
        threadId: params.threadId,
      },
      replace: true,
    });
  },
  component: () => null,
});
