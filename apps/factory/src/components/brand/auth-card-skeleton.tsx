import { Skeleton } from "@/components/ui/skeleton";

/** Card-shaped placeholder for sign-in / consent while config or session settles. */
export function AuthCardSkeleton() {
  return (
    <div
      aria-busy="true"
      className="rounded-xl border border-border bg-card p-6 shadow-sm"
      role="status"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="h-6 w-28" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-6 h-3.5 w-12" />
      <Skeleton className="mt-2 h-9 w-full" />
      <Skeleton className="mt-4 h-3.5 w-16" />
      <Skeleton className="mt-2 h-9 w-full" />
      <Skeleton className="mt-6 h-9 w-full" />
    </div>
  );
}
