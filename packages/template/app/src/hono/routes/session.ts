import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { member, organization } from "../../db/schema";
import type { AppEnv } from "../middleware";

/**
 * Everything the SPA needs before it can decide what to render: is there a
 * session, does the user have an organization yet, and which one is active.
 * The client asks once and the route guards share the answer.
 *
 * Adopting the user's first membership when no organization is active keeps
 * a returning user out of onboarding they already completed.
 */
export const sessionRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({
      authenticated: false as const,
      needsOnboarding: false,
      user: null,
      session: null,
      organization: null,
    });
  }

  let activeOrganizationId = session.session.activeOrganizationId ?? null;

  if (!activeOrganizationId) {
    const membership = await db.query.member.findFirst({
      where: eq(member.userId, session.user.id),
    });
    if (membership) {
      await auth.api.setActiveOrganization({
        headers: c.req.raw.headers,
        body: { organizationId: membership.organizationId },
      });
      activeOrganizationId = membership.organizationId;
    }
  }

  const row = activeOrganizationId
    ? await db.query.organization.findFirst({
        where: eq(organization.id, activeOrganizationId),
      })
    : undefined;

  return c.json({
    authenticated: true as const,
    needsOnboarding: !activeOrganizationId,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    session: {
      id: session.session.id,
      activeOrganizationId,
    },
    organization: row ? { id: row.id, name: row.name, slug: row.slug } : null,
  });
});
