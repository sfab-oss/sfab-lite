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
  BETTER_AUTH_SECRET?: string;
}
