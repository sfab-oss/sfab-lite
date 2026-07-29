/**
 * Live-sha hint bus for factory preview shells.
 *
 * Chat browser tabs and the console iframe route subscribe here so a single
 * `app_live_changed` fan-out can reload matching iframes without injecting a
 * bus client into the served app origin.
 */
type Listener = (appId: string, liveSha: string) => void;

const listeners = new Set<Listener>();

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLive(appId: string, liveSha: string): void {
  for (const listener of listeners) {
    listener(appId, liveSha);
  }
}
