import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
      await db
        .delete(user)
        .where(eq(user.id, createdUser.id))
        .catch(() => undefined);
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
 * - On sign-up, `user.create.after` inserts the org + owner membership so
 *   the session hook has a row to stamp.
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
      enabled: passwordAuthEnabled(env),
      // Stubs return a resolved promise rather than being `async`: there is
      // nothing to await until a real mail provider is wired in.
      sendResetPassword: ({ user: u, url }) => {
        console.info("[factory auth stub] password-reset", u.email, url);
        return Promise.resolve();
      },
    },
    trustedOrigins: [baseURL],
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
