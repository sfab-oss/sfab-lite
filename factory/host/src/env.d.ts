import type { AppAgent } from "./agent/app-agent.js";
import type { ArtifactsBinding } from "./code-host/artifacts-code-host.js";
import type { AppCreateDO } from "./durable-objects/app-create-do.js";
import type { AppDataDO } from "./durable-objects/app-data-do.js";
import type { OrgEvents } from "./durable-objects/org-events-do.js";

declare global {
  interface Env {
    LOADER: WorkerLoader;
    /** Runtime SQLite per serve target (`${appId}:live` | `${appId}:pr:N`). */
    APP_DATA_DO: DurableObjectNamespace<AppDataDO>;
    /** Create jobs + alarms; instance name is bare `appId`. */
    APP_CREATE_DO: DurableObjectNamespace<AppCreateDO>;
    /**
     * Per-app Think root. Instance name is `appId`. Owns the shared
     * workspace and thread registry; AppThread facets hang off it.
     * Binding name matches the class so `routeAgentRequest` can resolve it.
     */
    AppAgent: DurableObjectNamespace<AppAgent>;
    /**
     * Org-scoped factory hint bus. Instance name is `organizationId`.
     * Hibernatable WebSockets + publish RPC; stores only `lastSeq`.
     */
    ORG_EVENTS: DurableObjectNamespace<OrgEvents>;
    /**
     * The factory's own D1 — auth, organizations, and the app registry.
     *
     * It exists because **Durable Objects cannot be enumerated**:
     * `idFromName(appId)` is a hash, so the factory can address an app it can
     * name and cannot discover one it can't. Nothing here is app data — every
     * app's own rows live in its AppDataDO.
     */
    DB: D1Database;
    /**
     * Versioned client kernel chunks (`kernels/<version>/…`) and catalog
     * module ESM (`modules/<name>@<version>/…`). Current `KERNEL_VERSION`
     * stays in-bundle; older kernels and every catalog-module pin are
     * served from here.
     */
    KERNEL_R2: R2Bucket;
    /**
     * Immutable builds under `builds/{appId}/{sha}.json`, derived tree cache
     * under `trees/{appId}/{sha}.json`, and app object storage (opt-in
     * `capabilities: ["storage"]`) under `apps/{appId}/{generation}/`.
     * Git remotes live on `ARTIFACTS`, not this bucket. Remote bucket name:
     * `sfab-lite-code`.
     */
    CODE_R2: R2Bucket;
    /**
     * Cloudflare Artifacts namespace `sfab-lite-apps` — control plane for
     * per-app git remotes. Binding name is the vendor product; product nouns
     * stay code host / repo.
     */
    ARTIFACTS: ArtifactsBinding;
    /** Service binding → sfab-lite-check */
    CHECK: Fetcher;
    /** Service binding → sfab-lite-lint */
    LINT: Fetcher;
    /** Service binding → sfab-lite-build */
    BUILD: Fetcher;
    /**
     * Service binding → this same worker. `pnpm seed` (computer or `--live`)
     * runs inside the AppAgent DO, which has no `ExecutionContext` and
     * therefore cannot call `serveSubApp` directly; going back through the
     * front door gives the app worker the same environment a browser request
     * would.
     */
    SELF: Fetcher;
    /**
     * The **factory's** better-auth secret — its own sign-in, not any app's.
     *
     * Per docs/engineering/terminology.md, factory terms go unqualified and
     * app-side ones take the `app` qualifier. The host now holds two
     * better-auth secrets, so the two names must never be confused.
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
     * Folded into `/api/config`'s `signUpAvailable` — not reported directly —
     * so the sign-in screen can hide the sign-up form rather than offer a
     * button that cannot succeed. `/api/protected/health` still reports this one
     * verbatim, where "open to anyone" is the question being asked.
     */
    SIGNUP_OPEN?: string;
    /**
     * Addresses allowed to register, separated by commas or whitespace.
     *
     * The narrow alternative to `SIGNUP_OPEN`: a deployed factory can hand
     * accounts to a named few without opening the door to anyone with the URL.
     * Only ever restricts — setting it beside `SIGNUP_OPEN=true` keeps the
     * restriction rather than lifting it, so the pair cannot combine into an
     * open front door by accident.
     */
    SIGNUP_ALLOWLIST?: string;
    /**
     * Gates every `/api/protected/*` route, and **must be byte-identical in all four
     * workers** — factory, check, lint, and build. The factory presents it over the
     * service bindings; check, lint and build compare it. A mismatch surfaces
     * mid-commit as `lint_failed` / `lintHttp: 401`, which names the wrong
     * component entirely. `/api/protected/health` reports a fingerprint of the value
     * from each worker so a mismatch is visible before it costs a debugging
     * session. See `docs/engineering/DEPLOY.md`.
     *
     * Unset does **not** open the surface — `resolveActor` 401s a request
     * with no usable credential whatever the config says.
     */
    ADMIN_TOKEN?: string;
    /**
     * GitHub sign-in for the **factory** — the intended production front
     * door. Unqualified per docs/engineering/terminology.md: these are the
     * factory's own credentials and are never injected into a generated app.
     *
     * The provider is registered only when **both** are non-blank after a
     * trim — a whitespace-only secret is treated as absent, since it is
     * truthy but cannot complete a token exchange.
     *
     * There is no separate on/off flag: a flag that only mirrors "did you set
     * the secrets" is a second source of truth that can disagree with the
     * first. Half-configured shows up on `/api/protected/health`, which reports the
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
     * Z.AI coding-plan API key for the factory agent. Worker secret —
     * never expose via `/api/config` or any response.
     */
    ZAI_API_KEY?: string;
    /**
     * Enables harness-only `@callable`s on AppThread facets (e.g. harnessBash).
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
