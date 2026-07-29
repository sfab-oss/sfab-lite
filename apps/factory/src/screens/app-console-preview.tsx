import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@sfab-lite/ui/components/shadcn/resizable";
import { useIsMobile } from "@sfab-lite/ui/hooks/use-mobile";
import { Code2, ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  readPreviewCodeOpen,
  writePreviewCodeOpen,
} from "@/features/preview/code-panel-preference";
import { subscribeLive } from "@/features/preview/live-bus";
import { PreviewCodePanel } from "@/features/preview/preview-code-panel";
import {
  appBasePath,
  reloadPreviewFrame,
} from "@/features/preview/reload-preview";

const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";

export function AppConsolePreviewScreen({ appId }: { appId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const liveRef = useRef<string | null>(null);
  const rootSrc = `${appBasePath(appId)}/`;
  const isMobile = useIsMobile();
  const [codeOpen, setCodeOpen] = useState(false);

  useEffect(() => {
    setCodeOpen(readPreviewCodeOpen());
  }, []);

  const setCodeOpenPersisted = (open: boolean) => {
    setCodeOpen(open);
    writePreviewCodeOpen(open);
  };

  useEffect(
    () =>
      subscribeLive((nextAppId, nextLiveSha) => {
        if (nextAppId !== appId) {
          return;
        }
        if (liveRef.current === nextLiveSha) {
          return;
        }
        liveRef.current = nextLiveSha;
        reloadPreviewFrame(iframeRef.current, appId, "/");
      }),
    [appId]
  );

  const reload = () => {
    reloadPreviewFrame(iframeRef.current, appId, "/");
  };

  const previewFrame = (
    <iframe
      className="h-full min-h-0 w-full flex-1 border-0 bg-background"
      ref={iframeRef}
      sandbox={IFRAME_SANDBOX}
      src={rootSrc}
      title="App preview"
    />
  );

  let body: React.ReactNode = (
    <div className="flex min-h-0 flex-1 flex-col">{previewFrame}</div>
  );
  if (codeOpen && isMobile) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col">
        <PreviewCodePanel appId={appId} />
      </div>
    );
  } else if (codeOpen) {
    body = (
      <ResizablePanelGroup className="min-h-0 flex-1" direction="horizontal">
        <ResizablePanel
          className="flex min-h-0 flex-col"
          defaultSize={58}
          minSize={30}
        >
          {previewFrame}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          className="flex min-h-0 flex-col border-l"
          defaultSize={42}
          maxSize={70}
          minSize={22}
        >
          <PreviewCodePanel appId={appId} />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return (
    <>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-border border-b px-3">
        <span className="text-sm">Preview</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label={codeOpen ? "Hide code panel" : "Show code panel"}
            aria-pressed={codeOpen}
            className="h-8 gap-1.5 px-2"
            onClick={() => setCodeOpenPersisted(!codeOpen)}
            size="sm"
            type="button"
            variant={codeOpen ? "secondary" : "ghost"}
          >
            <Code2 className="size-4" />
            <span className="text-xs">Code</span>
          </Button>
          <Button
            aria-label="Reload preview"
            className="size-8"
            onClick={reload}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            aria-label="Open preview in new tab"
            className="size-8"
            onClick={() =>
              window.open(rootSrc, "_blank", "noopener,noreferrer")
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>
      {body}
    </>
  );
}
