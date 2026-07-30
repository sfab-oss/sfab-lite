import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import { useState } from "react";
import { FileBrowser } from "@/components/workspace-files/file-browser";
import { useTreeAtRef } from "@/hooks/query/use-code-tree";
import { useCodeTreeFilesSource } from "@/hooks/use-code-tree-files-source";

const DEFAULT_REF = "main";

function CodeTreeBrowser({
  appId,
  refName,
  paths,
  sha,
}: {
  appId: string;
  refName: string;
  paths: string[];
  sha: string;
}) {
  const source = useCodeTreeFilesSource(appId, refName, paths, sha);
  return <FileBrowser revision={sha} rootPath="" source={source} />;
}

export function AppCodePage({ appId }: { appId: string }) {
  const [ref, setRef] = useState(DEFAULT_REF);
  const treeQuery = useTreeAtRef(appId, ref);
  const tree = treeQuery.data ?? null;

  const branches = tree?.branches ?? [];
  let branchOptions = branches;
  if (branchOptions.length === 0) {
    branchOptions = [ref || DEFAULT_REF];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Branch</span>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs"
            onChange={(e) => setRef(e.target.value)}
            value={branchOptions.includes(ref) ? ref : branchOptions[0]}
          >
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
        {tree ? (
          <span className="font-mono text-muted-foreground text-xs">
            {tree.sha.slice(0, 12)}
          </span>
        ) : null}
      </div>

      {treeQuery.isPending && !tree ? (
        <div className="flex flex-col gap-2 px-6 py-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : null}

      {treeQuery.error instanceof Error ? (
        <p className="px-6 py-6 text-destructive text-sm">
          {treeQuery.error.message}
        </p>
      ) : null}

      {tree ? (
        <div className="min-h-0 flex-1">
          <CodeTreeBrowser
            appId={appId}
            key={tree.sha}
            paths={tree.paths}
            refName={ref}
            sha={tree.sha}
          />
        </div>
      ) : null}
    </div>
  );
}
