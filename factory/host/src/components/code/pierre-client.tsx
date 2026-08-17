import { ClientOnly } from "@tanstack/react-router";
import { type ComponentProps, lazy, Suspense } from "react";

type PierreReact = typeof import("@pierre/diffs/react");

const LazyFile = lazy(() =>
  import("@pierre/diffs/react").then((m) => ({ default: m.File }))
);
const LazyMultiFileDiff = lazy(() =>
  import("@pierre/diffs/react").then((m) => ({ default: m.MultiFileDiff }))
);

export const PIERRE_THEME = {
  dark: "pierre-dark" as const,
  light: "pierre-light" as const,
};

function CodePlaceholder({ className }: { className?: string }) {
  return <div className={className ?? "min-h-24"} aria-busy="true" />;
}

export function PierreFile(props: ComponentProps<PierreReact["File"]>) {
  const fallback = <CodePlaceholder className="h-full min-h-24" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <LazyFile {...props} />
      </Suspense>
    </ClientOnly>
  );
}

export function PierreMultiFileDiff(
  props: ComponentProps<PierreReact["MultiFileDiff"]>
) {
  const fallback = <CodePlaceholder />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <LazyMultiFileDiff {...props} />
      </Suspense>
    </ClientOnly>
  );
}
