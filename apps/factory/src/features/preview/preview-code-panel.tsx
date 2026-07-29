import { useEffect, useState } from "react";
import { FileBrowser } from "@/features/workspace-files/file-browser";
import { useAppAgentWorkspace } from "./use-app-agent-workspace";

function WorkspaceBanner() {
  return (
    <p className="shrink-0 border-b px-3 py-2 text-muted-foreground text-xs">
      Workspace (WIP) — preview runs the live published version until you
      deploy.
    </p>
  );
}

export function PreviewCodePanel({ appId }: { appId: string }) {
  const source = useAppAgentWorkspace(appId);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPath && source.isFileMissing?.(selectedPath)) {
      setSelectedPath(null);
    }
  }, [selectedPath, source]);

  return (
    <FileBrowser
      banner={<WorkspaceBanner />}
      onSelectedPathChange={setSelectedPath}
      rootPath="/"
      selectedPath={selectedPath}
      source={source}
    />
  );
}
