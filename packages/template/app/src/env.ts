/**
 * Bindings and secrets this app receives.
 *
 * Lives in its own module so nothing has to import the worker entry to get
 * the type — that is what made `worker.ts → hono → worker.ts` a cycle.
 *
 * `DB` is D1-shaped either way: real D1 under standalone `wrangler dev`, and
 * the app's own Durable Object SQLite (via ScopedSql) in the factory.
 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Set by the factory when the app is served under its public URL. */
  BETTER_AUTH_URL?: string;
  /**
   * The app's public mount (`/a/<appId>`), set by the factory. Cookies are
   * scoped to it so apps sharing the factory's origin do not overwrite each
   * other's sessions. Unset under standalone `wrangler dev`, where the app
   * owns the whole origin.
   */
  APP_BASE_PATH?: string;
  BETTER_AUTH_SECRET?: string;
  /**
   * Authorizes `POST /api/dev/seed`, set per app by the factory and never
   * sent to the browser. Unset disables seeding outright — see the route:
   * refusing is the safe direction when the value goes missing.
   */
  SEED_TOKEN?: string;
}
