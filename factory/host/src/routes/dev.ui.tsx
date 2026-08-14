import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/console/console-shell-skeleton";

const UiKitPage = lazy(() =>
  import("@/components/dev/ui-kit").then((m) => ({ default: m.UiKitPage }))
);

export const Route = createFileRoute("/dev/ui")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  component: DevUiKit,
});

function DevUiKit() {
  return (
    <Suspense fallback={<ConsoleShellSkeleton />}>
      <UiKitPage />
    </Suspense>
  );
}
