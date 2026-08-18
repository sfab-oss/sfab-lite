import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
// biome-ignore lint/performance/noNamespaceImport: better-auth's drizzle adapter takes the whole schema module.
import * as schema from "../db/schema";
import { member } from "../db/schema";
import type { Env } from "../env";

/**
 * Origins allowed to drive the auth base URL when it is not configured.
 * Standalone dev only: Vite serves the SPA on 5173 and proxies `/api` to
 * wrangler on 8787, so cookies must land on the origin the browser is on.
 * In the factory `BETTER_AUTH_URL` is always set and this list is unused.
 */
const DEV_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];

/** Must differ from the factory console's prefix — they share an origin. */
const APP_COOKIE_PREFIX = "sfab-app";

/**
 * Where this app believes it is mounted.
 *
 * `BETTER_AUTH_URL` wins — the factory sets it per app. Otherwise an
 * `Origin` header is honoured only if it is one of the known dev origins;
 * an arbitrary caller must not get to choose the auth base URL. Falling
 * back to the request's own origin keeps direct `wrangler dev` working.
 */
export function resolveBaseUrl(env: Env, request: Request): string {
  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) {
    return configured;
  }

  const origin = request.headers.get("origin");
  if (origin && DEV_ORIGINS.includes(origin)) {
    return origin;
  }

  return new URL(request.url).origin;
}

/**
 * Path this app's cookies are scoped to.
 *
 * Every app the factory hosts shares one origin, so a cookie at `Path=/`
 * belongs to whichever app wrote it last. `APP_BASE_PATH` is the app's public
 * mount (`/a/<appId>`), which `BETTER_AUTH_URL` cannot supply: the loader
 * strips that prefix before the app sees the request, so the app is told its
 * own origin and nothing more.
 *
 * Unset means standalone `wrangler dev`, where the app *is* the whole origin.
 */
function resolveCookiePath(env: Env): string {
  const configured = env.APP_BASE_PATH?.trim();
  return configured?.startsWith("/") ? configured : "/";
}

/**
 * Better Auth for the lite template.
 * - No framework cookie plugin — Hono/Workers cookie handling is enough.
 * - Invitation and password-reset emails are console stubs (no mail
 *   provider in the seed; wire one up in your own app).
 */
export function createAuth(env: Env, baseURL: string) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET missing or too short (need ≥32 chars). Copy .dev.vars.example → .dev.vars"
    );
  }

  const db = createDb(env);

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    // Distinct from the factory console's `sfab-factory`, and scoped to this
    // app's own path — the two together are what stop apps and the console
    // from evicting each other's sessions on the shared origin. The name alone
    // is not enough: two apps would still both hold `Path=/` cookies under one
    // name, and the browser would send both with no way to tell them apart.
    advanced: {
      cookiePrefix: APP_COOKIE_PREFIX,
      defaultCookieAttributes: { path: resolveCookiePath(env) },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      // Stubs return a resolved promise rather than being `async`: there is
      // nothing to await until a real mail provider is wired in.
      sendResetPassword: ({ user, url }) => {
        console.info("[auth stub] password-reset", user.email, url);
        return Promise.resolve();
      },
    },
    trustedOrigins: [...DEV_ORIGINS, baseURL],
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        sendInvitationEmail(data) {
          console.info(
            "[auth stub] org-invite",
            data.email,
            data.organization.name,
            data.id
          );
          return Promise.resolve();
        },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const membership = await db.query.member.findFirst({
              where: eq(member.userId, session.userId),
            });
            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
