const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LEADING_SLASH = /^\//;
const LOCALHOST_PREFIX = /^https?:\/\/localhost(?::\d+)?/i;

export type PreviewServeMode = "live" | "preview";

export function appBasePath(appId: string): string {
  return `/a/${encodeURIComponent(appId)}`;
}

export function appPrPreviewBasePath(appId: string, prNumber: number): string {
  return `/a/${encodeURIComponent(appId)}/preview/${prNumber}`;
}

export function appWorkspaceBasePath(workspaceId: string): string {
  return `/a/${encodeURIComponent(workspaceId)}/workspace`;
}

export function localhostDisplayPath(relativePath: string): string {
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `http://localhost${path === "/" ? "/" : path}`;
}

export function stripLocalhostDisplay(input: string): string {
  const trimmed = input.trim();
  if (LOCALHOST_PREFIX.test(trimmed)) {
    const withoutHost = trimmed.replace(LOCALHOST_PREFIX, "");
    return withoutHost.startsWith("/") ? withoutHost : `/${withoutHost || ""}`;
  }
  return trimmed;
}

function clampToBase(base: string, input: string): string {
  try {
    let rel = stripLocalhostDisplay(input) || "/";
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

export function clampToApp(
  appId: string,
  input: string,
  mode: PreviewServeMode = "live",
  prNumber?: number
): string {
  const base =
    mode === "preview" && prNumber != null
      ? appPrPreviewBasePath(appId, prNumber)
      : appBasePath(appId);
  return clampToBase(base, input);
}

export function clampToWorkspace(workspaceId: string, input: string): string {
  return clampToBase(appWorkspaceBasePath(workspaceId), input);
}

export function reloadWorkspaceFrame(
  frame: HTMLIFrameElement | null,
  workspaceId: string,
  relativePath: string
): void {
  if (!frame) {
    return;
  }
  try {
    frame.contentWindow?.location.reload();
  } catch {
    frame.src = clampToWorkspace(workspaceId, relativePath);
  }
}
