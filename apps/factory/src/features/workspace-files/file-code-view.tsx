import { File as PierreFile } from "@pierre/diffs/react";

const PIERRE_THEME = {
  dark: "pierre-dark" as const,
  light: "pierre-light" as const,
};

export function FileCodeView({
  content,
  path,
}: {
  content: string;
  path: string;
}) {
  const name = path.includes("/")
    ? path.slice(path.lastIndexOf("/") + 1)
    : path;
  return (
    <div className="h-full min-h-0 overflow-auto">
      <PierreFile
        disableWorkerPool
        file={{
          name,
          contents: content,
          cacheKey: `${path}:${content.length}`,
        }}
        options={{
          theme: PIERRE_THEME,
          overflow: "scroll",
          disableFileHeader: true,
        }}
        style={{ height: "100%", minHeight: "100%" }}
      />
    </div>
  );
}
