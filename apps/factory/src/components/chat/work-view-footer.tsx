import { WorkBranchSelector } from "@/components/chat/work-branch-selector";

export function WorkViewFooter({ appId }: { appId: string }) {
  return (
    <footer className="flex h-9 shrink-0 items-center gap-2 border-border border-t bg-muted/20 px-2">
      <WorkBranchSelector appId={appId} />
    </footer>
  );
}
