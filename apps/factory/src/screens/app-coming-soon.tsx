export function AppComingSoonScreen({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-start justify-start px-6 py-10">
      <h1 className="m-0 font-semibold text-lg">{title}</h1>
      <p className="mt-2 text-muted-foreground text-sm">Coming in next PR</p>
    </div>
  );
}
