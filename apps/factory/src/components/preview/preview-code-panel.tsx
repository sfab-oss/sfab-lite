import { useEffect, useState } from "react";
import { FileBrowser } from "@/components/workspace-files/file-browser";
import { useAppAgentWorkspace } from "@/hooks/use-app-agent-workspace";

function WorkspaceBanner() {
  return (
    <p className="shrink-0 border-b px-3 py-2 text-muted-foreground text-xs">
      Workspace (WIP) — this console iframe serves the live build; PR previews
      open from the PR detail page.
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
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceBanner />
      <div className="min-h-0 flex-1">
        <FileBrowser
          onSelectedPathChange={setSelectedPath}
          rootPath="/"
          selectedPath={selectedPath}
          source={source}
        />
      </div>
    </div>
  );
}
