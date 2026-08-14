import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { createDb } from "../../db/index.js";
import {
  mcpOrganizationGrant,
  member,
  oauthClient,
  organization,
} from "../../db/schema.js";

export interface McpGrant {
  organizationId: string;
  organizationSlug: string;
  userId: string;
}

/**
 * The organization an MCP access token acts in, or `null` if it may not act.
 *
 * This is the authorization chokepoint, and it is why the token alone is not
 * enough: a JWT is verified locally against the JWKS, so nothing can revoke one
 * before it expires, and it carries a user and a client but no organization.
 * Both facts are answered here — membership is re-read on every request rather
 * than trusted from consent time, and deleting the grant row denies the client
 * immediately.
 */
export async function resolveMcpGrant(
  env: Env,
  params: { clientId: string; userId: string }
): Promise<McpGrant | null> {
  const db = createDb(env);
  const [row] = await db
    .select({
      organizationId: mcpOrganizationGrant.organizationId,
      organizationSlug: organization.slug,
    })
    .from(mcpOrganizationGrant)
    .innerJoin(
      organization,
      eq(organization.id, mcpOrganizationGrant.organizationId)
    )
    // A disabled client is denied even where a grant row survives.
    .innerJoin(
      oauthClient,
      and(
        eq(oauthClient.clientId, mcpOrganizationGrant.clientId),
        eq(oauthClient.disabled, false)
      )
    )
    .where(
      and(
        eq(mcpOrganizationGrant.clientId, params.clientId),
        eq(mcpOrganizationGrant.userId, params.userId)
      )
    )
    .limit(1);
  if (!row) {
    return null;
  }

  if (
    !(await isOrganizationMember(env, {
      userId: params.userId,
      organizationId: row.organizationId,
    }))
  ) {
    return null;
  }

  return {
    userId: params.userId,
    organizationId: row.organizationId,
    organizationSlug: row.organizationSlug,
  };
}

/**
 * Bind a `(clientId, userId)` pair to an organization.
 *
 * An upsert against the UNIQUE index rather than a read-then-write: two
 * consents racing for the same pair converge on one row instead of leaving a
 * duplicate that `resolveMcpGrant` would pick between arbitrarily.
 * Re-authorizing with a different org rebinds in place.
 */
export async function upsertMcpOrganizationGrant(
  env: Env,
  params: { clientId: string; userId: string; organizationId: string }
): Promise<void> {
  await createDb(env)
    .insert(mcpOrganizationGrant)
    .values({
      id: `mcpgrant_${ulid()}`,
      clientId: params.clientId,
      userId: params.userId,
      organizationId: params.organizationId,
    })
    .onConflictDoUpdate({
      target: [mcpOrganizationGrant.clientId, mcpOrganizationGrant.userId],
      set: { organizationId: params.organizationId, updatedAt: new Date() },
    });
}

export async function isOrganizationMember(
  env: Env,
  params: { userId: string; organizationId: string }
): Promise<boolean> {
  const [row] = await createDb(env)
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, params.organizationId),
        eq(member.userId, params.userId)
      )
    )
    .limit(1);
  return Boolean(row);
}

/** The organizations a user may bind a client to — what the consent UI offers. */
export async function organizationsForUser(
  env: Env,
  userId: string
): Promise<{ id: string; name: string; slug: string }[]> {
  return await createDb(env)
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
}

export async function oauthClientExists(
  env: Env,
  clientId: string
): Promise<boolean> {
  const [row] = await createDb(env)
    .select({ clientId: oauthClient.clientId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return Boolean(row);
}
