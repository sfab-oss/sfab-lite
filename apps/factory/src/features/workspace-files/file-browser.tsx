import { Badge } from "@sfab-lite/ui/components/shadcn/badge";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sfab-lite/ui/components/shadcn/collapsible";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@sfab-lite/ui/components/shadcn/resizable";
import { useIsMobile } from "@sfab-lite/ui/hooks/use-mobile";
import { cn } from "@sfab-lite/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileIcon,
  Folder,
} from "lucide-react";
import { useState } from "react";
import { FileCodeView } from "./file-code-view";
import type {
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceFilesSource,
} from "./types";

const INDENT_STEP = 12;
const BASE_PAD = 8;

function rowPad(depth: number): React.CSSProperties {
  return { paddingLeft: BASE_PAD + depth * INDENT_STEP };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBrowser({
  source,
  banner,
  rootPath = "",
  selectedPath: controlledPath,
  onSelectedPathChange,
}: {
  source: WorkspaceFilesSource;
  banner?: React.ReactNode;
  rootPath?: string;
  selectedPath?: string | null;
  onSelectedPathChange?: (path: string | null) => void;
}) {
  const [uncontrolledPath, setUncontrolledPath] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const selectedPath =
    controlledPath === undefined ? uncontrolledPath : controlledPath;
  const setSelectedPath = (path: string | null) => {
    onSelectedPathChange?.(path);
    if (controlledPath === undefined) {
      setUncontrolledPath(path);
    }
  };

  if (isMobile) {
    if (!selectedPath) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          {banner}
          <FileTree
            activePath={null}
            onSelectPath={setSelectedPath}
            rootPath={rootPath}
            source={source}
          />
        </div>
      );
    }
    return (
      <FileViewer
        onBack={() => setSelectedPath(null)}
        path={selectedPath}
        source={source}
      />
    );
  }

  const viewer = selectedPath ? (
    <FileViewer path={selectedPath} source={source} />
  ) : (
    <NoFileSelected />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {banner}
      <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
        <ResizablePanel className="min-h-0" defaultSize={68} minSize={40}>
          {viewer}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          className="flex min-h-0 flex-col border-l"
          defaultSize={32}
          maxSize={50}
          minSize={18}
        >
          <FileTree
            activePath={selectedPath}
            onSelectPath={setSelectedPath}
            rootPath={rootPath}
            source={source}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function FileTree({
  source,
  rootPath,
  activePath,
  onSelectPath,
}: {
  source: WorkspaceFilesSource;
  rootPath: string;
  activePath: string | null;
  onSelectPath: (path: string) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto py-1 text-sm">
      <TreeLevel
        activePath={activePath}
        depth={0}
        onSelectPath={onSelectPath}
        path={rootPath}
        source={source}
      />
    </div>
  );
}

function TreeLevel({
  source,
  path,
  depth,
  activePath,
  onSelectPath,
}: {
  source: WorkspaceFilesSource;
  path: string;
  depth: number;
  activePath: string | null;
  onSelectPath: (path: string) => void;
}) {
  const entries = source.getDir(path);
  const loading = source.isDirLoading?.(path) ?? false;

  if (loading && entries.length === 0) {
    return (
      <p
        className="px-2 py-1 text-muted-foreground text-xs"
        style={rowPad(depth)}
      >
        Loading…
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p
        className="px-2 py-1 text-muted-foreground text-xs"
        style={rowPad(depth)}
      >
        Empty
      </p>
    );
  }

  return (
    <>
      {entries.map((entry) =>
        entry.type === "directory" ? (
          <DirNode
            activePath={activePath}
            depth={depth}
            entry={entry}
            key={entry.path}
            onSelectPath={onSelectPath}
            source={source}
          />
        ) : (
          <FileNode
            active={activePath === entry.path}
            depth={depth}
            entry={entry}
            key={entry.path}
            onSelectPath={onSelectPath}
          />
        )
      )}
    </>
  );
}

function DirNode({
  source,
  entry,
  depth,
  activePath,
  onSelectPath,
}: {
  source: WorkspaceFilesSource;
  entry: WorkspaceFileEntry;
  depth: number;
  activePath: string | null;
  onSelectPath: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger
        render={
          <button
            className="group flex w-full items-center gap-1.5 py-1.5 pr-2 text-left hover:bg-muted"
            style={rowPad(depth)}
            type="button"
          />
        }
      >
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{entry.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {open ? (
          <TreeLevel
            activePath={activePath}
            depth={depth + 1}
            onSelectPath={onSelectPath}
            path={entry.path}
            source={source}
          />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FileNode({
  entry,
  depth,
  active,
  onSelectPath,
}: {
  entry: WorkspaceFileEntry;
  depth: number;
  active: boolean;
  onSelectPath: (path: string) => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-1.5 py-1.5 pr-2 text-left hover:bg-muted",
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      )}
      onClick={() => onSelectPath(entry.path)}
      style={rowPad(depth)}
      type="button"
    >
      <span className="size-3.5 shrink-0" />
      <File className="size-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function FileViewer({
  source,
  path,
  onBack,
}: {
  source: WorkspaceFilesSource;
  path: string;
  onBack?: () => void;
}) {
  const file = source.getFile(path);
  const loading = source.isFileLoading?.(path) ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
        {onBack ? (
          <Button
            aria-label="Back to files"
            className="size-8 shrink-0"
            onClick={onBack}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="size-4" />
          </Button>
        ) : null}
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={path}
        >
          {path}
        </span>
        {file ? (
          <Badge className="shrink-0 text-[10px]" variant="outline">
            {file.encoding === "text" ? file.mimeType : file.encoding}
          </Badge>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {renderViewerBody(file, path, loading)}
      </div>
    </div>
  );
}

function renderViewerBody(
  file: WorkspaceFileContent | null,
  path: string,
  loading: boolean
) {
  if (file) {
    return renderFileBody(file, path);
  }
  if (loading) {
    return <p className="p-4 text-muted-foreground text-sm">Loading…</p>;
  }
  return (
    <p className="p-4 text-muted-foreground text-sm">
      File could not be loaded.
    </p>
  );
}

function renderFileBody(file: WorkspaceFileContent, path: string) {
  if (file.encoding === "too-large") {
    return (
      <FileNotice>
        File too large to preview ({formatBytes(file.size)}). Open it in the
        terminal instead.
      </FileNotice>
    );
  }
  if (file.encoding === "binary") {
    return (
      <FileNotice>
        Binary file — preview not available ({formatBytes(file.size)}).
      </FileNotice>
    );
  }

  return <FileCodeView content={file.content} path={path} />;
}

function FileNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function NoFileSelected() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <FileIcon className="size-6 text-muted-foreground" />
      <p className="max-w-xs text-muted-foreground text-sm">
        Select a file from the tree to view it.
      </p>
    </div>
  );
}
