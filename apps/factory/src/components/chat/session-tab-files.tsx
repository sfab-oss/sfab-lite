import { FileBrowser } from "@/components/workspace-files/file-browser";
import { useAgentWorkspaceFilesSource } from "@/hooks/use-agent-workspace-files-source";
import { useConsoleRoute } from "@/hooks/use-console-route";
import {
  useWorkspaceSelectedPath,
  useWorkspaceSelectedPathStore,
} from "@/lib/chat/workspace-selected-path-store";

export function SessionTabFiles() {
  const { workspaceId } = useConsoleRoute();

  if (!workspaceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">No workspace selected</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Open a workspace to browse its working tree.
        </p>
      </div>
    );
  }

  return <FilesBrowserBody key={workspaceId} workspaceId={workspaceId} />;
}

function FilesBrowserBody({ workspaceId }: { workspaceId: string }) {
  const { source, revision, waking, wakeError } =
    useAgentWorkspaceFilesSource(workspaceId);
  const selectedPath = useWorkspaceSelectedPath(workspaceId);
  const setSelectedPath = useWorkspaceSelectedPathStore(
    (s) => s.setSelectedPath
  );

  if (waking) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">Waking computer…</p>
        <p className="max-w-xs text-muted-foreground text-sm">
          Cloning the workspace so Files can open.
        </p>
      </div>
    );
  }

  if (wakeError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium text-sm">Computer failed to wake</p>
        <p className="max-w-xs text-destructive text-sm" title={wakeError}>
          {wakeError}
        </p>
      </div>
    );
  }

  return (
    <FileBrowser
      onSelectedPathChange={(path) => setSelectedPath(workspaceId, path)}
      revision={revision}
      rootPath=""
      selectedPath={selectedPath}
      source={source}
    />
  );
}
