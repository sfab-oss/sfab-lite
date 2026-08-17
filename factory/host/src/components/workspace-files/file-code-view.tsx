import { PIERRE_THEME, PierreFile } from "@/components/code/pierre-client";

function contentFingerprint(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) % 2_147_483_647;
  }
  return `${content.length}:${hash}`;
}

export function FileCodeView({
  content,
  path,
  revision,
}: {
  content: string;
  path: string;
  revision?: string;
}) {
  const name = path.includes("/")
    ? path.slice(path.lastIndexOf("/") + 1)
    : path;
  const cacheKey = revision
    ? `${revision}:${path}`
    : `${path}:${contentFingerprint(content)}`;
  return (
    <div className="h-full min-h-0 overflow-auto">
      <PierreFile
        disableWorkerPool
        file={{
          name,
          contents: content,
          cacheKey,
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
