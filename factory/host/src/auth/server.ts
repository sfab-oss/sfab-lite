import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { createDb, type Db } from "../db/index.js";
// biome-ignore lint/performance/noNamespaceImport: better-auth's drizzle adapter takes the whole schema module.
import * as schema from "../db/schema.js";
import {
  member,
  organization as organizationTable,
  session,
  user,
} from "../db/schema.js";
import {
  factoryTrustedOrigins,
  githubCredentialsForAuth,
  passwordAuthEnabled,
  signUpAllowlist,
  signUpAvailable,
} from "../lib/auth/policy.js";
import { defaultMcpResource, mcpResource } from "../mcp/lib/resource.js";

/** Must differ from the generated apps' prefix — they share an origin. */
const FACTORY_COOKIE_PREFIX = "sfab-factory";

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
 * Shape mirrors `starters/erp/app/src/auth/index.ts`, with the
 * factory-specific differences called out in the prior module docs.
 */
export function createAuth(env: Env, baseURL: string) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET missing or too short (need ≥32 chars). Copy .dev.vars.example → .dev.vars"
    );
  }

  const db = createDb(env);
  const github = githubCredentialsForAuth(env);
  const disableSignUp = !signUpAvailable(env);
  const allowlist = signUpAllowlist(env);

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret,
    advanced: { cookiePrefix: FACTORY_COOKIE_PREFIX },
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
      sendResetPassword: ({ user: u, url }) => {
        console.info("[factory auth stub] password-reset", u.email, url);
        return Promise.resolve();
      },
    },
    trustedOrigins: factoryTrustedOrigins(env, baseURL),
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
      jwt({
        disableSettingJwtHeader: true,
        jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
      }),
      oauthProvider({
        loginPage: "/signin",
        consentPage: "/mcp/consent",
        validAudiences: [mcpResource(baseURL)],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        accessTokenExpiresIn: 86_400,
        refreshTokenExpiresIn: 63_072_000,
      }),
    ],
    hooks: {
      // biome-ignore lint/suspicious/useAwait: better-auth's middleware type demands an async function.
      before: createAuthMiddleware(async (ctx) => {
        const body = defaultMcpResource(
          ctx.path,
          ctx.body,
          mcpResource(baseURL)
        );
        if (body) {
          return { context: { body } };
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
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
