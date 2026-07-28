import {
  type DynamicToolUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from "ai";
import { idToReadableText } from "../../lib/id-to-readable-text";
import { getToolName } from "./tool-registry";

type MessagePartClass = "nest" | "break";

/**
 * One list covers UIMessage part types (`file`, …) and tool names (`task`, …).
 * Text nests while more nestable work still follows; otherwise stays top-level.
 * Everything else nests into MessagePartGroup unless listed here.
 */
export interface MessagePartGroupPolicyInput {
  /** Part types / tool names that flush and stay top-level. Default: `["file"]`. */
  breakPartTypes?: readonly string[];
}

export interface MessagePartGroupPolicy {
  breakPartTypes: ReadonlySet<string>;
}

const DEFAULT_MESSAGE_PART_GROUP_POLICY: MessagePartGroupPolicy = {
  breakPartTypes: new Set(["file"]),
};

/** Provided list replaces the default (does not union). */
export function resolveMessagePartGroupPolicy(
  input?: MessagePartGroupPolicyInput
): MessagePartGroupPolicy {
  if (!input?.breakPartTypes) {
    return DEFAULT_MESSAGE_PART_GROUP_POLICY;
  }
  return { breakPartTypes: new Set(input.breakPartTypes) };
}

function isToolPart(
  part: UIMessagePart<UIDataTypes, UITools>
): part is DynamicToolUIPart | ToolUIPart {
  return part.type === "dynamic-tool" || isToolUIPart(part);
}

function classifyNonTextPart(
  part: UIMessagePart<UIDataTypes, UITools>,
  policy: MessagePartGroupPolicy
): MessagePartClass {
  if (policy.breakPartTypes.has(part.type)) {
    return "break";
  }
  if (isToolPart(part) && policy.breakPartTypes.has(getToolName(part))) {
    return "break";
  }
  return "nest";
}

function classifyMessagePart(
  part: UIMessagePart<UIDataTypes, UITools>,
  policy: MessagePartGroupPolicy = DEFAULT_MESSAGE_PART_GROUP_POLICY,
  context?: {
    parts: UIMessagePart<UIDataTypes, UITools>[];
    index: number;
  }
): MessagePartClass {
  if (part.type === "text") {
    if (!context) {
      return "break";
    }
    const nestableAfter = context.parts
      .slice(context.index + 1)
      .some((later) => classifyNonTextPart(later, policy) === "nest");
    return nestableAfter ? "nest" : "break";
  }
  return classifyNonTextPart(part, policy);
}

export interface IndexedMessagePart {
  part: UIMessagePart<UIDataTypes, UITools>;
  partIndex: number;
}

export type MessagePartSegment =
  | { kind: "single"; item: IndexedMessagePart }
  | { kind: "group"; items: IndexedMessagePart[]; startIndex: number };

export function groupMessageParts(
  parts: UIMessagePart<UIDataTypes, UITools>[],
  policy: MessagePartGroupPolicy = DEFAULT_MESSAGE_PART_GROUP_POLICY
): MessagePartSegment[] {
  const segments: MessagePartSegment[] = [];
  let pending: IndexedMessagePart[] = [];

  const flushPending = () => {
    if (pending.length === 0) {
      return;
    }
    segments.push({
      kind: "group",
      items: pending,
      startIndex: pending[0]?.partIndex ?? 0,
    });
    pending = [];
  };

  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (!part) {
      continue;
    }
    const classification = classifyMessagePart(part, policy, {
      parts,
      index: partIndex,
    });
    if (classification === "nest") {
      pending.push({ part, partIndex });
      continue;
    }
    flushPending();
    segments.push({ kind: "single", item: { part, partIndex } });
  }
  flushPending();
  return segments;
}

type MessagePartGroupPhase = "thinking" | "calling" | "done";

export interface MessagePartGroupStatus {
  label: string;
  phase: MessagePartGroupPhase;
  toolCount: number;
}

function toolIsRunning(part: DynamicToolUIPart | ToolUIPart): boolean {
  return (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded"
  );
}

export function describeMessagePartGroup(
  items: IndexedMessagePart[],
  options?: { isTurnBusy?: boolean }
): MessagePartGroupStatus {
  const isTurnBusy = options?.isTurnBusy === true;
  const tools = items.filter((item) => isToolPart(item.part));
  const toolCount = tools.length;
  const last = items.at(-1);

  if (isTurnBusy) {
    const runningTool = [...tools]
      .reverse()
      .find((item) =>
        toolIsRunning(item.part as DynamicToolUIPart | ToolUIPart)
      );
    if (runningTool) {
      return {
        phase: "calling",
        label: `Calling ${idToReadableText(getToolName(runningTool.part as DynamicToolUIPart | ToolUIPart))}`,
        toolCount,
      };
    }

    if (last?.part.type === "reasoning") {
      return {
        phase: "thinking",
        label: "Thinking",
        toolCount,
      };
    }
  }

  if (toolCount === 0) {
    return {
      phase: "done",
      label: "Thought",
      toolCount,
    };
  }

  return {
    phase: "done",
    label:
      toolCount === 1 ? "Worked with 1 tool" : `Worked with ${toolCount} tools`,
    toolCount,
  };
}
