import type { AppDO } from "./app-do.js";

declare global {
  interface Env {
    LOADER: WorkerLoader;
    APP_DO: DurableObjectNamespace<AppDO>;
    /**
     * The factory's own D1 — auth and organizations now, the app registry in
     * S3b.
     *
     * It exists because **Durable Objects cannot be enumerated**:
     * `idFromName(appId)` is a hash, so the factory can address an app it can
     * name and cannot discover one it can't. Nothing here is app data — every
     * app's own rows live in its AppDO.
     */
    DB: D1Database;
    /** Service binding → sfab-lite-check */
    CHECK: Fetcher;
    /** Service binding → sfab-lite-lint */
    LINT: Fetcher;
    /**
     * The **factory's** better-auth secret — its own sign-in, not any app's.
     *
     * Per GLOSSARY.md, factory terms go unqualified and app-side ones take the
     * `app` qualifier. The host now holds two better-auth secrets, so the two
     * names must never be confused.
     */
    BETTER_AUTH_SECRET: string;
    /**
     * The secret the host injects into **every sub-app**, where it arrives
     * under the plain name `BETTER_AUTH_SECRET` (see `serve.ts`).
     *
     * Required to serve any app: without it `/a/:appId/*` fails at runtime
     * with a 500, so a deploy that omits it produces a factory that boots fine
     * and cannot serve a single app. Not optional; the guard in `serve.ts`
     * stays because the type cannot enforce a secret being set.
     */
    APP_BETTER_AUTH_SECRET: string;
    /**
     * Enables email+password on the **factory's** sign-in. Default off:
     * fail-safe beats fail-open for an auth toggle.
     *
     * ⚠ Today "off" means **no sign-in at all**, not "GitHub only". The
     * intended production shape is GitHub OAuth, but no social provider is
     * wired yet — registering the OAuth app is an owner prerequisite. Until
     * that lands, a deploy with this unset mounts `/api/auth/*` and every
     * sign-in attempt 400s. Do not read this flag as "the safe production
     * default" before checking that a provider actually exists.
     *
     * Real enforcement, but not route removal: better-auth checks the option
     * at handler entry and returns 400, so the endpoints stay mounted. The UI
     * must therefore be *told* the flag rather than probing for a 404.
     */
    PASSWORD_AUTH?: string;
    /** When set, all `/admin/*` require matching `X-Admin-Token`. */
    ADMIN_TOKEN?: string;
    /**
     * GitHub sign-in for the **factory** — the intended production front
     * door. Unqualified per GLOSSARY.md: these are the factory's own
     * credentials and are never injected into a generated app.
     *
     * The provider is registered only when **both** are non-empty. There is
     * no separate on/off flag: a flag that only mirrors "did you set the
     * secrets" is a second source of truth that can disagree with the first.
     *
     * ⚠ We register a **GitHub App**, not an OAuth App. GitHub Apps ignore
     * the OAuth `scope` parameter entirely, so better-auth's built-in
     * `read:user`/`user:email` request is inert — access comes from the app's
     * configured *permissions*. better-auth reads `GET /user/emails` to fill
     * `user.email`, which is `NOT NULL UNIQUE`, so the app registration must
     * grant the **Email addresses** account permission or sign-up fails on a
     * database constraint rather than a useful error.
     *
     * Token expiry is irrelevant here: better-auth mints its own session
     * cookie and never reuses the GitHub token after the sign-in exchange.
     */
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
  }
}
