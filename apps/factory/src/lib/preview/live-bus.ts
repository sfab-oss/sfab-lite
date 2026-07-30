/**
 * Live-sha hint bus for factory surfaces that care about `app_live_changed`.
 */
type Listener = (appId: string, liveSha: string) => void;

const listeners = new Set<Listener>();

export function notifyLive(appId: string, liveSha: string): void {
  for (const listener of listeners) {
    listener(appId, liveSha);
  }
}
