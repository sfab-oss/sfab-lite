export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function parseSidebarStateCookie(
  cookieHeader: string | null | undefined
): boolean | undefined {
  if (!cookieHeader) {
    return;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName?.trim() !== SIDEBAR_COOKIE_NAME) {
      continue;
    }

    const value = rawValueParts.join("=").trim();
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    break;
  }
}

export function getSidebarDefaultOpen(
  cookieHeader: string | null | undefined
): boolean {
  return parseSidebarStateCookie(cookieHeader) ?? true;
}
