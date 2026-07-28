import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ConsoleShellSkeleton } from "@/components/brand/console-shell-skeleton";

const UiKitScreen = lazy(() =>
  import("@/screens/ui-kit").then((m) => ({ default: m.UiKitScreen }))
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
      <UiKitScreen />
    </Suspense>
  );
}
