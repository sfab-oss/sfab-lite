import type { AppThread } from "./agent/app-thread.js";
import type { AppDO } from "./app-do.js";

declare global {
  interface Env {
    /** Static factory console (Vite build in `ui/dist`). */
    ASSETS: Fetcher;
    LOADER: WorkerLoader;
    APP_DO: DurableObjectNamespace<AppDO>;
    /**
     * Per-thread Think agent. Instance name is `appId:threadId`. Binding
     * name matches the class so `routeAgentRequest` can resolve it.
     */
    AppThread: DurableObjectNamespace<AppThread>;
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
     * ⚠ "off" means **GitHub only** — and only if `GITHUB_CLIENT_ID` and
     * `GITHUB_CLIENT_SECRET` are both set. A deploy with this unset and no
     * GitHub credentials has **no sign-in at all**: `/api/auth/*` stays
     * mounted and every password attempt 400s. Do not read this flag as "the
     * safe production default" before checking that a provider actually
     * exists.
     *
     * Real enforcement, but not route removal: better-auth checks the option
     * at handler entry and returns 400, so the endpoints stay mounted. The UI
     * must therefore be *told* the flag rather than probing for a 404.
     */
    PASSWORD_AUTH?: string;
    /**
     * Opens **registration** — creating a new factory account — for both
     * password and GitHub. Default off, and off is the right production
     * setting once the accounts that need to exist do.
     *
     * Not a sign-in switch: better-auth's `disableSignUp` refuses user
     * creation and leaves authentication alone, so existing accounts keep
     * working while it is off. The two paths fail differently and neither is
     * a 404 — password sign-up returns **400
     * `EMAIL_PASSWORD_SIGN_UP_DISABLED`** (observed against a running local
     * factory), and an unknown GitHub user is redirected to the error URL
     * with `error=signup_disabled` (read from better-auth 1.6.19's
     * `callback.mjs`; not exercised, since it needs real credentials).
     *
     * Reported by `/api/config` so the sign-in screen can hide the sign-up
     * form rather than offer a button that cannot succeed.
     */
    SIGNUP_OPEN?: string;
    /**
     * Gates every `/admin/*` route, and **must be byte-identical in all three
     * workers** — factory, check, and lint. The factory presents it over the
     * service bindings; check and lint compare it. A mismatch surfaces
     * mid-commit as `lint_failed` / `lintHttp: 401`, which names the wrong
     * component entirely. `/admin/health` reports a fingerprint of the value
     * from each worker so a mismatch is visible before it costs a debugging
     * session. See `docs/DEPLOY.md`.
     *
     * Unset does **not** open the surface — `resolveActor` 401s a request
     * with no usable credential whatever the config says (S3c).
     */
    ADMIN_TOKEN?: string;
    /**
     * GitHub sign-in for the **factory** — the intended production front
     * door. Unqualified per GLOSSARY.md: these are the factory's own
     * credentials and are never injected into a generated app.
     *
     * The provider is registered only when **both** are non-blank after a
     * trim — a whitespace-only secret is treated as absent, since it is
     * truthy but cannot complete a token exchange.
     *
     * There is no separate on/off flag: a flag that only mirrors "did you set
     * the secrets" is a second source of truth that can disagree with the
     * first. Half-configured shows up on `/admin/health`, which reports the
     * two separately; nothing is logged.
     *
     * ⚠ We register a **GitHub App**, not an OAuth App. GitHub Apps ignore
     * the OAuth `scope` parameter entirely, so better-auth's built-in
     * `read:user`/`user:email` request is inert — access comes from the app's
     * configured *permissions*. better-auth reads `GET /user/emails` to fill
     * `user.email`, so the registration must grant the **Email addresses**
     * account permission. Without it the callback redirects with
     * `error=email_not_found` before any insert — you will never see the
     * `NOT NULL UNIQUE` constraint on that column fire.
     *
     * Token expiry is irrelevant here: better-auth mints its own session
     * cookie and never reuses the GitHub token after the sign-in exchange.
     */
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    /**
     * Z.AI coding-plan API key for the factory agent (S4). Worker secret —
     * never expose via `/api/config` or any response.
     */
    ZAI_API_KEY?: string;
    /**
     * Enables harness-only `@callable`s on `AppThread` (e.g. inspectWorkspace).
     * Local `.dev.vars` only — never set in production.
     */
    AGENT_HARNESS?: string;
    /**
     * Port the Vite console dev server is on, so its Origin can be trusted for
     * CSRF (see `viteDevOrigins`). Only consulted when `baseURL` is local, and
     * only needed by a worktree running on offset ports. Local `.dev.vars`.
     */
    UI_PORT?: string;
  }
}
