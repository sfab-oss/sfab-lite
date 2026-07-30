import { Thinking } from "@sfab-lite/ui/components/ai-elements/thinking";
import { Bubble, BubbleContent } from "@sfab-lite/ui/components/shadcn/bubble";
import { Markdown } from "@sfab-lite/ui/components/shadcn/markdown";
import { cn } from "@sfab-lite/ui/lib/utils";
import {
  type DynamicToolUIPart,
  isToolUIPart,
  type ToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from "ai";
import { useState } from "react";
import { DefaultTool } from "./default-tool";
import { useMessagePartGroupUi } from "./message-part-group";
import {
  getDisplayToolRenderer,
  getToolName,
  TOOL_RENDERERS_ALL_STATES,
} from "./tool-registry";

function MarkdownBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return <Markdown className={cn(className)}>{children}</Markdown>;
}

function ReasoningPart({
  text,
  isStreaming,
  showLoading,
  className,
  defaultOpen,
}: {
  text: string;
  isStreaming: boolean;
  showLoading: boolean;
  className?: string;
  defaultOpen: boolean;
}) {
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const hasBody = text.trim().length > 0;
  const title = isStreaming ? "Thinking..." : "Thought";
  const open = userOverride ?? (isStreaming || defaultOpen);

  return (
    <Thinking
      className={className}
      loading={showLoading}
      onOpenChange={setUserOverride}
      open={hasBody ? open : undefined}
      title={title}
    >
      {hasBody ? <Markdown>{text}</Markdown> : undefined}
    </Thinking>
  );
}

export function MessagePart({
  part,
  messageId,
  partIndex,
  isLoading,
  isLastPart,
  role = "assistant",
  embedded = false,
}: {
  part: UIMessagePart<UIDataTypes, UITools>;
  messageId: string;
  partIndex: number;
  isLoading: boolean;
  isLastPart: boolean;
  role?: "user" | "assistant" | "system";
  embedded?: boolean;
}) {
  const group = useMessagePartGroupUi();

  if (part.type === "text") {
    if (role === "user") {
      return (
        <Bubble
          align="end"
          key={`${messageId}-text-${partIndex}`}
          variant="secondary"
        >
          <BubbleContent>
            <MarkdownBody className="text-base">{part.text}</MarkdownBody>
          </BubbleContent>
        </Bubble>
      );
    }
    if (embedded) {
      return (
        <div className="my-1" key={`${messageId}-text-${partIndex}`}>
          <MarkdownBody className="text-base">{part.text}</MarkdownBody>
        </div>
      );
    }
    return (
      <Bubble key={`${messageId}-text-${partIndex}`} variant="ghost">
        <BubbleContent className="w-full max-w-full">
          <MarkdownBody className="text-base">{part.text}</MarkdownBody>
        </BubbleContent>
      </Bubble>
    );
  }

  if (part.type === "reasoning") {
    const streaming = isLoading && isLastPart;
    return (
      <ReasoningPart
        className={embedded ? "my-1" : "my-2"}
        defaultOpen={embedded ? streaming : true}
        isStreaming={streaming}
        key={`${messageId}-reasoning-${partIndex}`}
        showLoading={streaming && (group == null || group.open)}
        text={part.text}
      />
    );
  }

  if (part.type === "dynamic-tool" || isToolUIPart(part)) {
    const toolPart = part as DynamicToolUIPart | ToolUIPart;
    const toolName = getToolName(toolPart);
    const Renderer =
      toolPart.state === "output-available" ||
      TOOL_RENDERERS_ALL_STATES.has(toolName)
        ? getDisplayToolRenderer(toolPart)
        : undefined;
    if (Renderer) {
      return (
        <Renderer key={`${messageId}-tool-${partIndex}`} part={toolPart} />
      );
    }
    return (
      <DefaultTool key={`${messageId}-tool-${partIndex}`} part={toolPart} />
    );
  }

  return null;
}
