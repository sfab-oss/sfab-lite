/** biome-ignore-all lint/suspicious/noArrayIndexKey: plain file lines have no stable ids */

const TRAILING_NEWLINE = /\n$/;

export function MockFileCodeView({
  content,
}: {
  content: string;
  path: string;
}) {
  const lines = content.replace(TRAILING_NEWLINE, "").split("\n");
  return (
    <div className="h-full overflow-auto">
      <pre className="m-0 min-h-full p-3 font-mono text-[12px] leading-5">
        {lines.map((line, index) => (
          <div className="flex" key={`${index}-${line.slice(0, 12)}`}>
            <span className="mr-4 inline-block min-w-8 shrink-0 select-none text-right text-muted-foreground">
              {index + 1}
            </span>
            <span className="whitespace-pre-wrap break-all text-foreground">
              {line.length > 0 ? line : " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}
