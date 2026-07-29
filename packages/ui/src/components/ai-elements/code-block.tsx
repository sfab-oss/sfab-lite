import { cn } from "@sfab-lite/ui/lib/utils";
import type { HTMLAttributes } from "react";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
};

export function CodeBlock({
  code,
  className,
  language: _language,
  showLineNumbers: _showLineNumbers,
  ...props
}: CodeBlockProps) {
  return (
    <div
      className={cn("overflow-auto rounded-md bg-muted/50 p-3", className)}
      {...props}
    >
      <pre className="m-0 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
