import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@sfab-lite/ui/components/ai-elements/tool";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { memo } from "react";
import { idToReadableText } from "@/lib/chat/id-to-readable-text";

export interface DefaultToolProps {
  part: ToolUIPart | DynamicToolUIPart;
}

function toolInputSummary(
  toolName: string,
  input: unknown
): string | undefined {
  if (!input || typeof input !== "object") {
    return;
  }
  const record = input as Record<string, unknown>;
  const name = toolName.toLowerCase();
  if (
    (name === "bash" || name === "shell") &&
    typeof record.command === "string"
  ) {
    return record.command;
  }
  const path = record.file_path ?? record.path ?? record.filePath;
  if (typeof path === "string") {
    return path;
  }
  if (typeof record.pattern === "string") {
    return record.pattern;
  }
  if (typeof record.query === "string") {
    return record.query;
  }
}

function truncateSummary(value: string, max = 72): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

export const DefaultTool = memo(({ part }: DefaultToolProps) => {
  const toolName =
    "toolName" in part && typeof part.toolName === "string"
      ? part.toolName
      : part.type.slice(5);
  const readable = idToReadableText(toolName, { capitalize: true });
  const summary = toolInputSummary(toolName, part.input);
  const title = summary
    ? `${readable} · ${truncateSummary(summary)}`
    : readable;
  const isRunning =
    part.state === "input-available" || part.state === "input-streaming";
  const defaultOpen = part.state === "approval-requested" || isRunning;

  return (
    <Tool defaultOpen={defaultOpen} key={part.state}>
      <ToolHeader state={part.state} title={title} type={part.type} />
      <ToolContent>
        <ToolInput input={part.input} />
        {isRunning && !part.output && !part.errorText ? (
          <output className="block px-4 pb-4 text-muted-foreground text-xs">
            Running…
          </output>
        ) : null}
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
});
