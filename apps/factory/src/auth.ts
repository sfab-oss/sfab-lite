import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { createDb, type Db } from "./db/index.js";
// biome-ignore lint/performance/noNamespaceImport: better-auth's drizzle adapter takes the whole schema module.
import * as schema from "./db/schema.js";
import {
  member,
  organization as organizationTable,
  session,
  user,
} from "./db/schema.js";

/**
 * Fail-safe: only the exact string `"true"` enables password auth. Unset,
 * empty, or any other value stays off — a missing toggle must not open a
 * sign-in surface we did not mean to expose.
 */
export function passwordAuthEnabled(env: Env): boolean {
  return env.PASSWORD_AUTH === "true";
}

/**
 * Whether anyone may create a **new** factory account.
 *
 * Same fail-safe rule as `passwordAuthEnabled`, and for a sharper reason: this
 * deploy is reachable by URL, so an unset toggle would leave the front door
 * open to the whole internet. Only the exact string `"true"` opens it.
 *
 * This gates *registration*, not authentication — better-auth's `disableSignUp`
 * refuses to create a user and leaves sign-in untouched, so existing accounts
 * keep working when it flips off. Turning it on is therefore reversible and
 * costs nothing to leave closed.
 */
export function signUpOpen(env: Env): boolean {
  return env.SIGNUP_OPEN === "true";
}

const NO_ALLOWLIST: ReadonlySet<string> = new Set();

const RE_ALLOWLIST_SEPARATOR = /[\s,]+/;

/**
 * The addresses permitted to register, or an empty set when none is configured.
 *
 * Lowercased because better-auth normalises the address before it reaches the
 * hook, so an entry differing only in case would never match and would read as
 * "the allowlist is broken" rather than "the entry is wrong".
 */
function allowlistRaw(env: Env): string {
  return env.SIGNUP_ALLOWLIST?.trim() ?? "";
}

export function signUpAllowlist(env: Env): ReadonlySet<string> {
  const raw = allowlistRaw(env);
  if (!raw) {
    return NO_ALLOWLIST;
  }
  return new Set(
    raw
      .split(RE_ALLOWLIST_SEPARATOR)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Whether a registration path exists at all — sign-up open to everyone, or an
 * allowlist naming who may take it.
 *
 * The two are not competing switches: the allowlist only ever *restricts*, so
 * setting `SIGNUP_OPEN=true` beside one leaves the allowlist in force instead
 * of widening it back open. Both unset still means closed.
 */
export function signUpAvailable(env: Env): boolean {
  // A list that is set but parses to nothing — a stray comma, a botched paste —
  // means *nobody*, not "fall back to SIGNUP_OPEN". Falling back would let a
  // typo in the value reopen the door the value was written to close, which is
  // the one direction this must never fail in.
  if (allowlistRaw(env)) {
    return signUpAllowlist(env).size > 0;
  }
  return signUpOpen(env);
}

/**
 * One definition of "this secret is set": non-blank after a trim.
 *
 * Everything that asks about the GitHub credentials — registration, the
 * public config flag, and the per-secret health detail — resolves through
 * this, so none of them can disagree about whether a value counts.
 */
function trimmedSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The factory's GitHub credentials, or `null` if it has none.
 *
 * Returning the pair rather than a boolean keeps "both are present" in one
 * place and lets the caller use the narrowed strings — a separate predicate
 * plus a cast at the use site would state the same invariant twice and let
 * them drift.
 *
 * Trimmed, and blank-after-trim counts as absent: `wrangler secret put` from
 * a here-doc or a copied line readily stores a trailing newline, and a
 * whitespace-only value is truthy. Without the trim that pair would register
 * a provider that cannot complete a token exchange, and `/api/config` would
 * advertise a sign-in button guaranteed to fail — the exact failure the
 * conditional registration below exists to prevent.
 */
function githubCredentials(
  env: Env
): { clientId: string; clientSecret: string } | null {
  const clientId = trimmedSecret(env.GITHUB_CLIENT_ID);
  const clientSecret = trimmedSecret(env.GITHUB_CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Presence of each GitHub secret, separately — the one question
 * `githubCredentials` cannot answer, because a pair-or-null collapses
 * "neither set" and "exactly one set" into the same `null`.
 *
 * Exists only for `/admin/health`: half-configured is a deploy mistake, and
 * telling it apart from "GitHub off on purpose" needs both bits. Booleans
 * only — a value must never leave the process.
 */
export function githubSecretsPresent(env: Env): {
  clientId: boolean;
  clientSecret: boolean;
} {
  return {
    clientId: trimmedSecret(env.GITHUB_CLIENT_ID) !== null,
    clientSecret: trimmedSecret(env.GITHUB_CLIENT_SECRET) !== null,
  };
}

/**
 * GitHub sign-in is on exactly when both credentials are present.
 *
 * No separate flag: one that only mirrored "are the secrets set" could
 * disagree with reality, and the disagreement would surface as a button that
 * posts to a guaranteed failure. Deriving it means the UI is told the truth.
 */
export function githubAuthEnabled(env: Env): boolean {
  return githubCredentials(env) !== null;
}

/**
 * Collision-safe org slug derived from the user id (UNIQUE column). Display
 * names are not unique — two users named "Alex" must not collide.
 */
function orgSlugForUser(userId: string): string {
  return `u-${userId}`;
}

async function provisionOwnerOrganization(
  db: Db,
  createdUser: { id: string; name: string }
): Promise<void> {
  const slug = orgSlugForUser(createdUser.id);
  const orgName =
    createdUser.name.trim().length > 0 ? createdUser.name.trim() : "Personal";

  const insertOrgAndMember = async () => {
    const orgId = ulid();
    const memberId = ulid();
    const now = new Date();
    await db.insert(organizationTable).values({
      id: orgId,
      name: orgName,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(member).values({
      id: memberId,
      organizationId: orgId,
      userId: createdUser.id,
      role: "owner",
      createdAt: now,
    });
    // Session may already exist (auto sign-in). Stamp it here because
    // `session.create.before` ran before this after-hook.
    await db
      .update(session)
      .set({ activeOrganizationId: orgId })
      .where(eq(session.userId, createdUser.id));
  };

  const scrubPartialOrg = async () => {
    await db
      .delete(organizationTable)
      .where(eq(organizationTable.slug, slug))
      .catch(() => undefined);
  };

  try {
    await insertOrgAndMember();
  } catch (first) {
    await scrubPartialOrg();
    try {
      await insertOrgAndMember();
    } catch (second) {
      await scrubPartialOrg();
      // Prefer a failed sign-up over an org-less user the session hook
      // cannot activate. Cascade clears account/session rows that auto
      // sign-in may already have written.
      //
      // Deliberately NOT swallowed. The adapter runs with `transaction:
      // false`, so the user row is already committed by the time this hook
      // runs — this delete is a compensating action, not a rollback, and it
      // is the only thing standing between a failed provision and an
      // org-less account whose email is now permanently taken. If it fails,
      // that is the loudest fact available and it must reach the caller.
      try {
        await db.delete(user).where(eq(user.id, createdUser.id));
      } catch (cleanupFailed) {
        const why = second instanceof Error ? second.message : String(second);
        throw new Error(
          `sign-up could not provision an organization for user ${createdUser.id} (${why}), and the compensating delete of that user ALSO failed — an org-less account remains and its email is now taken`,
          { cause: cleanupFailed }
        );
      }
      throw second instanceof Error ? second : first;
    }
  }
}

/**
 * Better Auth for the **factory** (not a generated app).
 *
 * Shape mirrors `packages/template/app/src/auth/index.ts`, with the
 * factory-specific differences called out below:
 * - Uses the factory's D1 + `BETTER_AUTH_SECRET` (never `APP_BETTER_AUTH_SECRET`).
 * - `allowUserToCreateOrganization: false` — sign-up already mints the one
 *   org the product expects; a user-facing create path would produce orgs
 *   nothing can render.
 * - `emailAndPassword.enabled` follows `PASSWORD_AUTH` (default off).
 * - GitHub is registered only when both credentials are set — the intended
 *   production front door, where password auth is the local convenience.
 * - `disableSignUp` follows `signUpAvailable` (default off) on **both**
 *   providers, so a deployed factory does not hand an account to anyone with
 *   the URL. Under an allowlist it stays *off* and `user.create.before`
 *   refuses the addresses that are not on the list.
 * - On sign-up, `user.create.after` inserts the org + owner membership so
 *   the session hook has a row to stamp.
 */
const RE_LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

const RE_PORT = /^\d{2,5}$/;

/** Must differ from the generated apps' prefix — they share an origin. */
const FACTORY_COOKIE_PREFIX = "sfab-factory";

function viteDevOrigins(baseURL: string, uiPort: string | undefined): string[] {
  if (!RE_LOCAL_ORIGIN.test(baseURL)) {
    return [];
  }
  const port = uiPort?.trim();
  const resolved = port && RE_PORT.test(port) ? port : "5173";
  return [`http://127.0.0.1:${resolved}`, `http://localhost:${resolved}`];
}

export function createAuth(env: Env, baseURL: string) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET missing or too short (need ≥32 chars). Copy .dev.vars.example → .dev.vars"
    );
  }

  const db = createDb(env);
  const github = githubCredentials(env);
  // One value drives both providers. Two independent switches could disagree,
  // and the disagreement would be a quietly open registration path on whichever
  // one was forgotten.
  const disableSignUp = !signUpAvailable(env);
  // `disableSignUp` is all-or-nothing, so an allowlisted factory must leave the
  // registration path open and reject per address in the create hook below.
  const allowlist = signUpAllowlist(env);

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    // The factory and every generated app share one origin, and better-auth's
    // default cookie name is derived from `appName` — so without this they all
    // issue `__Secure-better-auth.session_token` at `Path=/` and evict each
    // other. Signing into an app logged you out of the console and back again.
    // The app side takes `sfab-app` plus a per-app path; see the template's
    // `createAuth`.
    advanced: { cookiePrefix: FACTORY_COOKIE_PREFIX },
    // Spread rather than always passing a `github` key: registering the
    // provider with empty strings would mount a sign-in path that fails at
    // the token exchange instead of simply not existing.
    ...(github
      ? { socialProviders: { github: { ...github, disableSignUp } } }
      : {}),
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: passwordAuthEnabled(env),
      disableSignUp,
      // Stubs return a resolved promise rather than being `async`: there is
      // nothing to await until a real mail provider is wired in.
      sendResetPassword: ({ user: u, url }) => {
        console.info("[factory auth stub] password-reset", u.email, url);
        return Promise.resolve();
      },
    },
    // Vite serves the console and proxies `/api` to wrangler, so the browser
    // Origin is the Vite host while `baseURL` is the worker origin. Gated on a
    // local `baseURL`: this widens CSRF origin checking, and a deployed factory
    // must never trust an origin it does not serve.
    trustedOrigins: [baseURL, ...viteDevOrigins(baseURL, env.UI_PORT)],
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        sendInvitationEmail(data) {
          console.info(
            "[factory auth stub] org-invite",
            data.email,
            data.organization.name,
            data.id
          );
          return Promise.resolve();
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          /**
           * The allowlist's enforcement point, covering both providers:
           * password sign-up and GitHub both land here. `disableSignUp` cannot
           * express "these addresses only", so it stays off whenever a list is
           * configured and this hook carries the restriction.
           *
           * Throws rather than returning `false`: better-auth rethrows an
           * `APIError` unchanged but turns `false` into a generic
           * `FAILED_TO_CREATE_USER`, which reads as a factory bug to the one
           * person who can fix the list.
           */
          before: (candidate) => {
            if (
              allowlist.size > 0 &&
              !allowlist.has(candidate.email.toLowerCase())
            ) {
              throw new APIError("FORBIDDEN", {
                message: "This address is not on the sign-up allowlist.",
                code: "SIGNUP_NOT_ALLOWLISTED",
              });
            }
            return Promise.resolve();
          },
          /**
           * better-auth queues `create.after` until after the sign-up
           * "transaction" returns. With the drizzle adapter's default
           * `transaction: false` that is not a real D1 transaction — the
           * user (and usually a session) is already committed when we run.
           *
           * Failure mode: retry the org+member insert once; if it still
           * fails, delete the user (cascade clears account/session) and
           * rethrow so the sign-up request fails rather than leaving an
           * org-less account the session hook cannot activate.
           */
          after: async (createdUser) => {
            await provisionOwnerOrganization(db, createdUser);
          },
        },
      },
      session: {
        create: {
          before: async (sessionRow) => {
            const membership = await db.query.member.findFirst({
              where: eq(member.userId, sessionRow.userId),
            });
            return {
              data: {
                ...sessionRow,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
  });
}
