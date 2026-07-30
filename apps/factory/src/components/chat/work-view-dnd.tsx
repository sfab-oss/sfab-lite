import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { cn } from "@sfab-lite/ui/lib/utils";
import type { ReactNode } from "react";
import {
  type AppLayoutState,
  findPanelForTabId,
  type PanelId,
  panelDroppableId,
  parsePanelDroppableId,
  useWorkspaceTabsStore,
} from "@/lib/chat/workspace-tabs-store";

function resolveDrop(
  layout: AppLayoutState,
  overId: string
): { panel: PanelId; index: number | null } | null {
  const asPanel = parsePanelDroppableId(overId);
  if (asPanel) {
    return { panel: asPanel, index: null };
  }
  const panel = findPanelForTabId(layout, overId);
  if (!panel) {
    return null;
  }
  const tabs =
    panel === "primary" ? layout.primary.tabs : (layout.secondary?.tabs ?? []);
  const index = tabs.findIndex((tab) => tab.id === overId);
  return { panel, index: index >= 0 ? index : null };
}

export function WorkViewDnd({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const moveTab = useWorkspaceTabsStore((s) => s.moveTab);
  const reorderTab = useWorkspaceTabsStore((s) => s.reorderTab);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) {
      return;
    }

    const layout = useWorkspaceTabsStore.getState().byWorkspace[workspaceId];
    if (!layout) {
      return;
    }

    const from = findPanelForTabId(layout, activeId);
    if (!from) {
      return;
    }

    const drop = resolveDrop(layout, overId);
    if (!drop) {
      return;
    }

    if (from === drop.panel) {
      if (drop.index == null) {
        return;
      }
      reorderTab(workspaceId, from, activeId, drop.index);
      return;
    }

    moveTab(
      workspaceId,
      from,
      activeId,
      drop.panel,
      drop.index == null ? undefined : drop.index
    );
  };

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      {children}
    </DndContext>
  );
}

export function SecondaryCreateDropZone() {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: panelDroppableId("secondary"),
  });
  if (!active) {
    return null;
  }
  return (
    <div
      className={cn(
        "ml-px flex w-28 shrink-0 items-center justify-center rounded-l-xl border border-border border-dashed bg-muted/30 text-center text-muted-foreground text-xs transition-colors",
        isOver && "border-foreground/40 bg-accent text-foreground"
      )}
      ref={setNodeRef}
    >
      Drop to split
    </div>
  );
}
