import type { ComponentProps } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

export type MarkdownProps = ComponentProps<typeof Streamdown>;

/** Streamdown markdown body shared by chat + leftover markdown surfaces. */
export const Markdown = memo(
  ({ className, ...props }: MarkdownProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Markdown.displayName = "Markdown";
