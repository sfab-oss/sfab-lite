export function ThreadSummaryPanel({
  thread,
}: {
  thread: { appName: string | null };
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted">
      <div className="flex h-10 shrink-0 items-center border-border/60 border-b px-3">
        <p className="font-medium text-sm">Summary</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {thread.appName ? (
          <div className="mb-2 px-0 py-1">
            <p className="font-medium text-muted-foreground text-xs">App</p>
            <p className="font-medium text-sm">{thread.appName}</p>
          </div>
        ) : (
          <p className="px-0 py-1 text-muted-foreground text-xs">
            No summary details for this thread.
          </p>
        )}
      </div>
    </div>
  );
}
