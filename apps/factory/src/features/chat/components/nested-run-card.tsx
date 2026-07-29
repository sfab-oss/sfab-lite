import { AgentSigil } from "@sfab-lite/ui/components/icons/agent-sigil";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { LoaderCircle } from "lucide-react";

type ToolPart = DynamicToolUIPart | ToolUIPart;

export function NestedRunCard({ part }: { part: ToolPart }) {
  const summary = summarizeTaskPart(part);

  return (
    <div className="my-2 rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-foreground">
          {summary.isRunning ? (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <AgentSigil className="size-4" id={summary.seed} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="truncate font-medium text-sm">{summary.title}</p>
            <span
              className={
                summary.isError
                  ? "text-destructive text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {summary.statusLabel}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {summary.detail}
          </p>
          {summary.isError && part.errorText ? (
            <p className="mt-1 text-destructive text-xs">{part.errorText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function summarizeTaskPart(part: ToolPart) {
  const input = asRecord(part.input);
  const output =
    part.state === "output-available" ? asRecord(part.output) : null;
  const runId =
    asString(input?.runId) ??
    ("toolCallId" in part && typeof part.toolCallId === "string"
      ? part.toolCallId
      : "task");
  const title =
    asString(input?.description)?.trim() ||
    asString(input?.prompt)?.trim() ||
    "Nested run";
  const agentType =
    asString(asRecord(input?.subagentType)?.kind) ??
    asString(input?.mode) ??
    "subagent";
  const seed = asString(input?.agentId) ?? runId;
  const durationMs =
    typeof output?.durationMs === "number" ? output.durationMs : undefined;
  const stepCount = Array.isArray(output?.conversationSteps)
    ? output.conversationSteps.length
    : undefined;

  const isRunning =
    part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const isComplete = part.state === "output-available";

  let statusLabel = String(part.state);
  if (isError) {
    statusLabel = "Failed";
  } else if (isRunning) {
    statusLabel = "Running…";
  } else if (isComplete) {
    statusLabel = "Done";
  }

  const detailBits = [agentType];
  if (stepCount != null && stepCount > 0) {
    detailBits.push(`${stepCount} step${stepCount === 1 ? "" : "s"}`);
  }
  if (durationMs != null) {
    detailBits.push(`${(durationMs / 1000).toFixed(1)}s`);
  }

  return {
    detail: detailBits.join(" · "),
    isError,
    isRunning,
    seed,
    statusLabel,
    title,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
