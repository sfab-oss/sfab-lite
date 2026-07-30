import { useMemo } from "react";
import { FileBrowser } from "@/components/workspace-files/file-browser";
import { useChatData } from "@/lib/chat/chat-data-context";
import type { WorkspaceFilesSource } from "@/lib/workspace-files/types";

function PublishedBanner() {
  return (
    <p className="shrink-0 border-b px-3 py-2 text-muted-foreground text-xs">
      Published live version — not the agent's in-thread scratch workspace.
    </p>
  );
}

export function SessionTabFiles() {
  const data = useChatData();
  const source = useMemo<WorkspaceFilesSource>(
    () => ({
      getDir: (path) => data.getWorkspaceDir(path).entries,
      getFile: (path) => data.getWorkspaceFile(path),
    }),
    [data]
  );

  return (
    <FileBrowser banner={<PublishedBanner />} rootPath="" source={source} />
  );
}
