import { WorkBranchSelector } from "@/components/chat/work-branch-selector";

export function WorkViewFooter({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="flex h-9 shrink-0 items-center border-t px-2">
      <WorkBranchSelector workspaceId={workspaceId} />
    </div>
  );
}
