const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LEADING_SLASH = /^\//;

export function appBasePath(appId: string): string {
  return `/a/${encodeURIComponent(appId)}`;
}

export function clampToApp(appId: string, input: string): string {
  const base = appBasePath(appId);
  try {
    let rel = input.trim() || "/";
    if (ABSOLUTE_URL.test(rel) || rel.startsWith("//")) {
      return `${base}/`;
    }
    if (rel === base || rel === `${base}/` || rel.startsWith(`${base}/`)) {
      rel = rel.slice(base.length) || "/";
    }
    if (!rel.startsWith("/")) {
      rel = `/${rel}`;
    }
    const resolved = new URL(
      rel.replace(LEADING_SLASH, ""),
      `https://x.invalid${base}/`
    );
    if (
      resolved.pathname !== base &&
      !resolved.pathname.startsWith(`${base}/`)
    ) {
      return `${base}/`;
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return `${base}/`;
  }
}

export function reloadPreviewFrame(
  frame: HTMLIFrameElement | null,
  appId: string,
  relativePath: string
): void {
  if (!frame) {
    return;
  }
  try {
    frame.contentWindow?.location.reload();
  } catch {
    frame.src = clampToApp(appId, relativePath);
  }
}
