import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";

/**
 * Stand-in for AppLayout while the signed-in console chunk loads.
 * Same silhouette (inset sidebar + rounded card) so boot does not flash
 * a blank "Loading…" page before the real chrome appears.
 */
export function ConsoleShellSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex h-svh w-full bg-background"
      role="status"
    >
      <span className="sr-only">Loading</span>
      <aside className="hidden w-[16rem] shrink-0 flex-col gap-3 p-2 pt-2 pl-2 md:flex">
        <div className="flex h-10 items-center gap-2 px-2">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-2 px-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="mt-2 flex flex-col gap-2 px-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-5/6" />
          <Skeleton className="h-8 w-4/5" />
        </div>
        <div className="mt-auto flex items-center gap-2 px-2 pb-2">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col md:pt-2 md:pr-2 md:pb-2">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-background shadow">
          <div className="flex h-10 shrink-0 items-center gap-2 border-border border-b px-3">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="mt-2 h-24 w-full max-w-3xl rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
