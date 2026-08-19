declare global {
  interface Window {
    /**
     * Injected by the factory when this app is served under a path prefix
     * (e.g. `/a/my-app`). Absent in standalone dev, where the app owns the
     * whole origin.
     */
    __SFAB_PUBLIC_BASE__?: string;
  }
}

/**
 * Where this app is mounted, or `undefined` when it owns the origin.
 *
 * Everything that builds a URL — the API client, the auth client, and the
 * router `basepath` — reads it from here, so the app works unchanged whether
 * it is served standalone or under a prefix. Do not hardcode absolute
 * `/api/...` strings: they are correct standalone and wrong under a prefix.
 */
export const publicBase =
  typeof window === "undefined" ? undefined : window.__SFAB_PUBLIC_BASE__;
