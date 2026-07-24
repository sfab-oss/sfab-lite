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
