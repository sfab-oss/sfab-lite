/**
 * Live-sha hint bus for factory surfaces that care about `app_live_changed`.
 * Call `subscribeLive` from a shell that needs reload hints (kept as a
 * named export so knip sees the pair used together from call sites).
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
