import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";

export function AgentContentSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4"
      role="status"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="mt-2 h-24 w-full max-w-3xl rounded-xl" />
    </div>
  );
}
