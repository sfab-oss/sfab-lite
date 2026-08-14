const EXT_MIME: Record<string, string> = {
  css: "text/css",
  html: "text/html",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  mjs: "text/javascript",
  svg: "image/svg+xml",
  ts: "text/typescript",
  tsx: "text/typescript",
  txt: "text/plain",
};

export function mimeFor(path: string, fallback?: string): string {
  if (fallback && fallback !== "application/octet-stream") {
    return fallback;
  }
  const dot = path.lastIndexOf(".");
  if (dot < 0) {
    return "text/plain";
  }
  return EXT_MIME[path.slice(dot + 1).toLowerCase()] ?? "text/plain";
}
