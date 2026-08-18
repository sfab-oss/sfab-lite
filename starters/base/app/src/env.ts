import type { DbEnv } from "./db";

/**
 * Bindings and secrets this app receives.
 *
 * Lives in its own module so nothing has to import the worker entry to get
 * the type — that is what made `worker.ts → hono → worker.ts` a cycle.
 *
 * `DB` comes from the generated `DbEnv`. Host-injected: `BETTER_AUTH_URL`,
 * `APP_BASE_PATH`, `SEED_TOKEN` (APP-FORMAT §6).
 */
export interface Env extends DbEnv {
  ASSETS: Fetcher;
  /** Public URL when the app is served under a host origin. */
  BETTER_AUTH_URL?: string;
  /**
   * The app's public mount (`/a/<appId>`). Cookies are scoped to it so apps
   * sharing an origin do not overwrite each other's sessions. Unset under
   * standalone `wrangler dev`, where the app owns the whole origin.
   */
  APP_BASE_PATH?: string;
  BETTER_AUTH_SECRET?: string;
  /**
   * Authorizes `POST /api/dev/seed`, set per app and never sent to the
   * browser. Unset disables seeding outright — see the route: refusing is
   * the safe direction when the value goes missing.
   */
  SEED_TOKEN?: string;
}
