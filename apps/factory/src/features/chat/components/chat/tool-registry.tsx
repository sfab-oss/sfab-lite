import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentType } from "react";
import { NestedRunCard } from "../nested-run-card";

export interface ToolRenderProps {
  part: ToolUIPart | DynamicToolUIPart;
}

const TOOL_RENDERERS: Record<string, ComponentType<ToolRenderProps>> = {
  task: NestedRunCard,
};

export const TOOL_RENDERERS_ALL_STATES = new Set(["task"]);

export function getToolName(part: ToolUIPart | DynamicToolUIPart): string {
  if ("toolName" in part && typeof part.toolName === "string") {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return part.type;
}

export function getDisplayToolRenderer(
  part: ToolUIPart | DynamicToolUIPart
): ComponentType<ToolRenderProps> | undefined {
  return TOOL_RENDERERS[getToolName(part)];
}
