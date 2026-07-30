import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";

/** Brand-only boot paint while session / admin probe resolve. */
export function SessionBoot() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-muted/40 p-6"
      role="status"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="size-8 rounded-lg" />
      <Skeleton className="h-5 w-20" />
    </div>
  );
}
