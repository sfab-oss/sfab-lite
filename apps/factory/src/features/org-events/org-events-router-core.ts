import type { OrgEventWire } from "../../org-events.js";

export interface OrgEventsRouterDeps {
  coalesce: (run: () => void) => void;
  invalidateApps: () => void;
  invalidateApp: (appId: string) => void;
  invalidateVersions: (appId: string) => void;
  refreshAttendedApp: (appId: string) => void;
  onLiveVersion: (appId: string, liveSha: string) => void;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pure topic → client reaction map. Unit-tested without React Query / WS.
 */
export function routeOrgEvent(
  frame: OrgEventWire,
  deps: OrgEventsRouterDeps
): void {
  const { topic, payload } = frame;
  if (topic === "app_list_changed") {
    deps.coalesce(() => {
      deps.invalidateApps();
    });
    return;
  }
  if (topic === "app_record_changed") {
    const appId = asString(payload.appId);
    if (!appId) {
      return;
    }
    deps.coalesce(() => {
      deps.invalidateApp(appId);
      deps.invalidateApps();
    });
    return;
  }
  if (topic === "app_live_changed") {
    const appId = asString(payload.appId);
    const liveSha = asString(payload.liveSha);
    if (!(appId && liveSha)) {
      return;
    }
    deps.coalesce(() => {
      deps.invalidateVersions(appId);
    });
    deps.refreshAttendedApp(appId);
    deps.onLiveVersion(appId, liveSha);
  }
}
