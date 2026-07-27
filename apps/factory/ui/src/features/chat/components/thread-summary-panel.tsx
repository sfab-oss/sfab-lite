import { ChevronRight, FileIcon, PaperclipIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useChatData } from "../data/chat-data-context";
import type { AttachedFile, Thread } from "../model/types";

export function ThreadSummaryPanel({ thread }: { thread: Thread }) {
  const data = useChatData();
  const files = useMemo(
    () => data.listAttachedFiles(thread.id),
    [data, thread.id]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted">
      <div className="flex h-10 shrink-0 items-center border-border/60 border-b px-3">
        <p className="font-medium text-sm">Summary</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {thread.appName ? (
          <div className="mb-2 px-0 py-1">
            <p className="font-medium text-muted-foreground text-xs">App</p>
            <p className="font-medium text-sm">{thread.appName}</p>
          </div>
        ) : null}
        {files.length > 0 ? <FilesSection files={files} /> : null}
      </div>
    </div>
  );
}

function FilesSection({ files }: { files: AttachedFile[] }) {
  const first = files[0];
  if (!first) {
    return null;
  }
  const previewLabel =
    files.length === 1
      ? first.filename
      : `${first.filename} +${files.length - 1}`;

  return (
    <SummarySection
      defaultOpen
      icon={<PaperclipIcon className="size-3.5" />}
      preview={
        <div className="space-y-1">
          <p className="truncate font-medium text-sm leading-snug">
            {previewLabel}
          </p>
          <p className="text-muted-foreground text-xs">
            {files.length === 1
              ? "1 file in this conversation"
              : `${files.length} files in this conversation`}
          </p>
        </div>
      }
      title="Files"
    >
      <ul className="flex flex-col gap-1.5">
        {files.map((file) => (
          <li key={file.filename}>
            <SummaryFileAttachment file={file} />
          </li>
        ))}
      </ul>
    </SummarySection>
  );
}

function SummaryFileAttachment({ file }: { file: AttachedFile }) {
  const isImage = Boolean(file.mediaType?.startsWith("image/") && file.url);
  let icon = <PaperclipIcon />;
  if (isImage && file.url) {
    icon = <img alt="" height={14} src={file.url} width={14} />;
  } else if (
    file.mediaType?.includes("pdf") ||
    file.mediaType?.includes("csv") ||
    file.mediaType?.includes("text")
  ) {
    icon = <FileIcon />;
  }

  const body = (
    <Attachment size="xs">
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {icon}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.filename}</AttachmentTitle>
      </AttachmentContent>
    </Attachment>
  );

  if (file.url) {
    return (
      <a
        className="inline-flex max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={file.url}
        rel="noreferrer"
        target="_blank"
        title="Open attachment"
      >
        {body}
      </a>
    );
  }

  return body;
}

function SummarySection({
  title,
  icon,
  preview,
  children,
  defaultOpen = false,
}: {
  children?: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  preview: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const canExpand = children != null;

  return (
    <Collapsible
      disabled={!canExpand}
      onOpenChange={setOpen}
      open={canExpand ? open : false}
    >
      <CollapsibleTrigger
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-md px-0 font-medium text-xs",
          "text-foreground outline-none transition-colors",
          canExpand &&
            "hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-background/50",
          !canExpand && "cursor-default"
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
            !canExpand && "opacity-0"
          )}
        />
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <span>{title}</span>
      </CollapsibleTrigger>

      <div className="pb-2 pl-5">{preview}</div>

      {canExpand ? (
        <CollapsibleContent className="pb-3 pl-5">
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
