import { Message, MessageContent } from "@/components/ui/message";
import { lookupSubagent, nestedRunToMessages } from "../lib/mock-subagents";
import { MessageParts } from "./chat/message-parts";

export function MockAgentRunPanel({
  runId,
  threadId,
}: {
  runId: string;
  threadId: string;
}) {
  const run = lookupSubagent(threadId, runId);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
        Nested run not found.
      </div>
    );
  }

  const messages = nestedRunToMessages(run);
  const turnBusy = run.status === "running";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
          {messages.map((message, index) => {
            const isActiveTurn =
              turnBusy &&
              index === messages.length - 1 &&
              message.role === "assistant";
            const isLoading = turnBusy && index === messages.length - 1;
            return (
              <Message
                align={message.role === "user" ? "end" : "start"}
                key={message.id}
              >
                <MessageContent className="flex flex-col gap-3">
                  <MessageParts
                    isActiveTurn={isActiveTurn}
                    isLoading={isLoading}
                    messageId={message.id}
                    parts={message.parts}
                    role={message.role}
                  />
                </MessageContent>
              </Message>
            );
          })}
        </div>
      </div>
    </div>
  );
}
