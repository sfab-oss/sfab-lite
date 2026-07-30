/** biome-ignore-all lint/suspicious/noArrayIndexKey: streaming parts have no stable ids */

import { useAgentChat } from "@cloudflare/think/react";
import { ThinkingPending } from "@sfab-lite/ui/components/ai-elements/thinking";
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@sfab-lite/ui/components/shadcn/attachment";
import {
  Message,
  MessageContent,
} from "@sfab-lite/ui/components/shadcn/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@sfab-lite/ui/components/shadcn/message-scroller";
import { useAgent } from "agents/react";
import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import { FileIcon, PaperclipIcon } from "lucide-react";
import { type RefObject, useEffect, useRef } from "react";
import { useChatData } from "@/components/chat/chat-data-context";
import { MessageParts } from "@/components/chat/message-parts";
import type { Thread } from "@/lib/chat/types";
import { ThreadComposer } from "./thread-composer";

type ThreadUIMessage = UIMessage;

export function ThreadTranscript({
  thread,
  initialMessage,
  onInitialConsumed,
  messagesRef,
}: {
  initialMessage?: string;
  /** Published for the header's copy action, which renders outside the chat. */
  messagesRef: RefObject<ThreadUIMessage[]>;
  onInitialConsumed?: () => void;
  thread: Thread;
}) {
  if (!thread.workspaceId?.startsWith("ws_")) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-muted-foreground text-sm">
        This thread is not bound to a workspace.
      </div>
    );
  }

  return (
    <BoundThreadTranscript
      initialMessage={initialMessage}
      key={`${thread.workspaceId}:${thread.id}`}
      messagesRef={messagesRef}
      onInitialConsumed={onInitialConsumed}
      thread={thread}
    />
  );
}

function BoundThreadTranscript({
  thread,
  initialMessage,
  onInitialConsumed,
  messagesRef,
}: {
  initialMessage?: string;
  messagesRef: RefObject<ThreadUIMessage[]>;
  onInitialConsumed?: () => void;
  thread: Thread;
}) {
  const data = useChatData();
  const agent = useAgent({
    agent: "AppAgent",
    name: thread.workspaceId as string,
    sub: [{ agent: "AppThread", name: thread.id }],
  });
  // Without a throttle, dense tool-input-delta bursts exceed React's nested
  // update limit inside useSyncExternalStore — cloudflare/agents#1361, #1732.
  const { messages, sendMessage, status, stop } = useAgentChat({
    agent,
    experimental_throttle: 50,
  });
  const running = status === "submitted" || status === "streaming";
  const sentInitial = useRef(false);
  const prevBusy = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    return () => {
      messagesRef.current = [];
    };
  }, [messages, messagesRef]);

  useEffect(() => {
    const nextStatus = running ? "running" : "idle";
    if (thread.status === nextStatus) {
      return;
    }
    data.patchThread(thread.id, {
      status: nextStatus,
      updatedAt: Date.now(),
    });
  }, [data, running, thread.id, thread.status]);

  useEffect(() => {
    const wasBusy = prevBusy.current;
    prevBusy.current = running;
    if (!(wasBusy && !running && thread.appId)) {
      return;
    }
    data.refreshApp(thread.appId).catch((error: unknown) => {
      console.error("[chat] refreshApp after turn failed", error);
    });
  }, [data, running, thread.appId]);

  useEffect(() => {
    if (!initialMessage || sentInitial.current) {
      return;
    }
    sentInitial.current = true;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: initialMessage }],
    })
      .catch((error: unknown) => {
        console.error("[chat] initial sendMessage failed", error);
      })
      .finally(() => {
        onInitialConsumed?.();
      });
  }, [initialMessage, onInitialConsumed, sendMessage]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <MessageList messages={messages} status={status} />
      {thread.readOnly ? (
        <p className="border-t px-4 py-3 text-center text-muted-foreground text-xs">
          This thread is read-only.
        </p>
      ) : (
        <ThreadComposer
          onStop={() => {
            stop().catch((error: unknown) => {
              console.error("[chat] stop failed", error);
            });
          }}
          onSubmit={(text) => {
            sendMessage({
              role: "user",
              parts: [{ type: "text", text }],
            }).catch((error: unknown) => {
              console.error("[chat] sendMessage failed", error);
            });
          }}
          running={running}
        />
      )}
    </div>
  );
}

function isAwaitingAssistantContent(
  messages: ThreadUIMessage[],
  status: ChatStatus
): boolean {
  if (status !== "submitted" && status !== "streaming") {
    return false;
  }
  const last = messages.at(-1);
  if (!last || last.role === "user") {
    return messages.some((message) => message.role === "user");
  }
  return last.parts.length === 0;
}

function MessageList({
  messages,
  status,
}: {
  messages: ThreadUIMessage[];
  status: ChatStatus;
}) {
  const turnBusy = status === "streaming" || status === "submitted";

  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="last-anchor"
      scrollPreviousItemPeek={64}
    >
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-4">
            {messages.map((message, index) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <ThreadMessage
                  isActiveTurn={
                    turnBusy &&
                    index === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  isLoading={turnBusy && index === messages.length - 1}
                  message={message}
                />
              </MessageScrollerItem>
            ))}
            {isAwaitingAssistantContent(messages, status) ? (
              <MessageScrollerItem messageId="turn-pending">
                <Message align="start">
                  <MessageContent>
                    <ThinkingPending />
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function FileAttachment({ part }: { part: FileUIPart }) {
  const isImage = Boolean(part.mediaType?.startsWith("image/") && part.url);
  const name = part.filename || (isImage ? "Image" : "Attachment");
  let icon = <PaperclipIcon />;
  if (isImage && part.url) {
    icon = <img alt="" height={14} src={part.url} width={14} />;
  } else if (
    part.mediaType?.includes("pdf") ||
    part.mediaType?.includes("csv")
  ) {
    icon = <FileIcon />;
  }

  return (
    <Attachment size="xs">
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {icon}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{name}</AttachmentTitle>
      </AttachmentContent>
    </Attachment>
  );
}

function ThreadMessage({
  isActiveTurn,
  isLoading,
  message,
}: {
  isActiveTurn: boolean;
  isLoading: boolean;
  message: ThreadUIMessage;
}) {
  const fileParts = message.parts.filter(
    (part): part is FileUIPart & { type: "file" } => part.type === "file"
  );
  const otherParts = message.parts.filter((part) => part.type !== "file");
  const hasAttachments = fileParts.length > 0;

  return (
    <Message align={message.role === "user" ? "end" : "start"}>
      <MessageContent className="flex flex-col gap-3">
        {hasAttachments ? (
          <div
            className={
              message.role === "user"
                ? "flex max-w-full flex-wrap items-center justify-end gap-1.5 self-end"
                : "flex max-w-full flex-wrap items-center gap-1.5"
            }
          >
            {fileParts.map((part, partIndex) => (
              <FileAttachment
                key={`${message.id}-file-${partIndex}`}
                part={part}
              />
            ))}
          </div>
        ) : null}
        <MessageParts
          isActiveTurn={isActiveTurn}
          isLoading={isLoading}
          messageId={message.id}
          parts={otherParts}
          role={message.role}
        />
      </MessageContent>
    </Message>
  );
}
