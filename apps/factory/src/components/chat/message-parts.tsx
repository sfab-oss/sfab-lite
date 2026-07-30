/** biome-ignore-all lint/suspicious/noArrayIndexKey: Message parts have no stable IDs */

import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { useMemo } from "react";
import {
  groupMessageParts,
  type MessagePartGroupPolicyInput,
  resolveMessagePartGroupPolicy,
} from "@/lib/chat/message-part-group-policy";
import { MessagePart } from "./message-part";
import { MessagePartGroup } from "./message-part-group";

export function MessageParts({
  parts,
  messageId,
  role = "assistant",
  isLoading = false,
  isActiveTurn = false,
  breakPartTypes,
}: {
  parts: UIMessagePart<UIDataTypes, UITools>[];
  messageId: string;
  role?: "user" | "assistant" | "system";
  isLoading?: boolean;
  isActiveTurn?: boolean;
  /**
   * Part types and/or tool names that stay top-level and flush the group
   * (e.g. `["file", "task"]`). Default `["file"]`.
   */
  breakPartTypes?: MessagePartGroupPolicyInput["breakPartTypes"];
}) {
  const policy = useMemo(
    () => resolveMessagePartGroupPolicy({ breakPartTypes }),
    [breakPartTypes]
  );

  const segments = useMemo(
    () => groupMessageParts(parts, policy),
    [parts, policy]
  );

  if (role === "user") {
    return (
      <>
        {parts.map((part, partIndex) => (
          <MessagePart
            isLastPart={partIndex === parts.length - 1}
            isLoading={isLoading}
            key={`${messageId}-part-${partIndex}`}
            messageId={messageId}
            part={part}
            partIndex={partIndex}
            role={role}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {segments.map((segment) => {
        if (segment.kind === "single") {
          const { part, partIndex } = segment.item;
          return (
            <MessagePart
              isLastPart={partIndex === parts.length - 1}
              isLoading={isLoading}
              key={`${messageId}-part-${partIndex}`}
              messageId={messageId}
              part={part}
              partIndex={partIndex}
              role={role}
            />
          );
        }

        const lastItem = segment.items.at(-1);
        const groupIsMessageTip = lastItem?.partIndex === parts.length - 1;
        return (
          <MessagePartGroup
            defaultOpen={isActiveTurn}
            isTurnBusy={isActiveTurn && groupIsMessageTip}
            items={segment.items}
            key={`${messageId}-group-${segment.startIndex}`}
          >
            {segment.items.map((item) => (
              <MessagePart
                embedded
                isLastPart={item.partIndex === parts.length - 1}
                isLoading={isLoading}
                key={`${messageId}-part-${item.partIndex}`}
                messageId={messageId}
                part={item.part}
                partIndex={item.partIndex}
                role={role}
              />
            ))}
          </MessagePartGroup>
        );
      })}
    </>
  );
}
