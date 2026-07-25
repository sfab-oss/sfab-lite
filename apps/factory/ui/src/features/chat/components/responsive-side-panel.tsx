import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The object panel docks beside the transcript when there is room and floats
 * over it when there is not.
 *
 * The threshold is measured on the content element rather than the viewport,
 * because collapsing the sidebar changes how much room the transcript actually
 * has — a viewport media query would dock a panel into a column too narrow to
 * read.
 *
 * Docked and overlay modes share the same floating-card surface (margin,
 * radius, border, shadow). Docked still occupies flex space so the chat
 * shifts left; only the narrow overlay covers the transcript.
 */

const DOCK_MIN_WIDTH = 1200;

/** Shared card chrome — inset from edges so the rail reads as floating. */
const PANEL_SURFACE = "overflow-hidden rounded-xl border bg-muted shadow-sm";

/**
 * ResizeObserver lives on the callback ref: attach when the node mounts,
 * disconnect when it clears. No effect — the ref is the subscription lifetime.
 */
export function useSidePanelLayout() {
  const [canDock, setCanDock] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setContainerNode = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) {
      setCanDock(false);
      return;
    }

    const update = () => setCanDock(node.clientWidth >= DOCK_MIN_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { canDock, setContainerNode };
}

export function ResponsiveSidePanel({
  open,
  canDock,
  onClose,
  panel,
  children,
}: {
  canDock: boolean;
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  panel: ReactNode;
}) {
  const showDocked = open && canDock;
  const showFloating = open && !canDock;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
        {showFloating ? (
          <>
            <button
              aria-label="Close panel"
              className="absolute inset-0 z-30 bg-background/40"
              onClick={onClose}
              type="button"
            />
            <div
              className={cn(
                "absolute top-3 right-3 z-40 flex h-[min(32rem,calc(100%-1.5rem))] w-80 flex-col",
                PANEL_SURFACE,
                "shadow-lg"
              )}
            >
              {panel}
            </div>
          </>
        ) : null}
      </div>
      {showDocked ? (
        <div
          className={cn(
            "m-3 flex h-[min(32rem,calc(100%-1.5rem))] w-80 shrink-0 flex-col self-start",
            PANEL_SURFACE
          )}
        >
          {panel}
        </div>
      ) : null}
    </div>
  );
}
