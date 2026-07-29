import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { Link } from "@tanstack/react-router";
import { ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { AppLayoutHeader } from "@/components/brand/app-layout";
import { subscribeLiveVersion } from "@/features/preview/live-version-bus";
import {
  appBasePath,
  reloadPreviewFrame,
} from "@/features/preview/reload-preview";
import { useApp } from "@/hooks/use-apps";

const IFRAME_SANDBOX = "allow-same-origin allow-scripts allow-forms";

export function AppConsolePreviewScreen({ appId }: { appId: string }) {
  const appQuery = useApp(appId);
  const app = appQuery.data ?? null;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const liveRef = useRef<string | null>(null);
  const rootSrc = `${appBasePath(appId)}/`;

  useEffect(
    () =>
      subscribeLiveVersion((nextAppId, liveVersionId) => {
        if (nextAppId !== appId) {
          return;
        }
        if (liveRef.current === liveVersionId) {
          return;
        }
        liveRef.current = liveVersionId;
        reloadPreviewFrame(iframeRef.current, appId, "/");
      }),
    [appId]
  );

  const reload = () => {
    reloadPreviewFrame(iframeRef.current, appId, "/");
  };

  return (
    <>
      <AppLayoutHeader className="px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            className="shrink-0 text-muted-foreground text-sm no-underline hover:underline"
            to="/apps"
          >
            Apps
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <Link
            className="truncate font-medium text-sm no-underline hover:underline"
            params={{ appId }}
            to="/apps/$appId"
          >
            {app?.name ?? "App"}
          </Link>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="shrink-0 text-sm">Preview</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            aria-label="Open live in new tab"
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
      </AppLayoutHeader>
      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-background"
        ref={iframeRef}
        sandbox={IFRAME_SANDBOX}
        src={rootSrc}
        title="App preview"
      />
    </>
  );
}
