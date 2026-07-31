import { and, eq, notExists } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { seedSchema } from "../../contract/dev";
import {
  account,
  document,
  documentLine,
  entity,
  member,
  organization,
  product,
  session,
  user,
} from "../../db/schema";
import type { AppEnv } from "../types";
import { jsonBody } from "../validate";

function isAuthApiError(err: unknown): err is {
  name: "APIError";
  statusCode: number;
  body?: { message?: string; code?: string };
  message?: string;
} {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "APIError" &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
  );
}

/**
 * The demo account every seeded app carries. The password is **not** here:
 * this route is public code in a public template, so a constant would be a
 * published owner login for every app that ever ran it. The caller supplies
 * one, and only a caller holding `SEED_TOKEN` can call.
 */
const SEED_EMAIL = "demo@example.com";
const SEED_NAME = "Demo User";
const SEED_ORG = "Demo Company";
const SEED_ORG_SLUG = "demo-company";

const PARTIES = [
  {
    kind: "customer" as const,
    name: "Northwind Trading",
    email: "ap@northwind.example",
  },
  {
    kind: "vendor" as const,
    name: "Globex Supply",
    email: "billing@globex.example",
  },
];

const PRODUCTS = [
  { sku: "WID-001", name: "Widget", unitPriceCents: 1999 },
  { sku: "GAD-002", name: "Gadget", unitPriceCents: 4950 },
];

const ISSUED_QUANTITY = 3;

/**
 * Seeding is not a public capability. `SEED_TOKEN` is injected per app by the
 * factory and never reaches the browser, so the only caller is `pnpm seed`.
 *
 * Unset means refuse, not allow: if the factory ever stopped injecting it, a
 * fail-open guard would silently republish an unauthenticated write endpoint
 * on every app. 404 rather than 401 — an unauthorized caller learns nothing
 * about whether the route is there.
 */
const requireSeedToken = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.SEED_TOKEN;
  if (!expected || c.req.header("x-sfab-seed") !== expected) {
    return c.notFound();
  }
  await next();
});

function seedErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "Seed failed";
}

function authErrorStatus(statusCode: number): 400 | 403 | 409 | 422 | 500 {
  if (
    statusCode === 400 ||
    statusCode === 403 ||
    statusCode === 409 ||
    statusCode === 422
  ) {
    return statusCode;
  }
  return 500;
}

/**
 * Sequential inserts — drizzle `db.batch` cannot cross LOADER→AppDataDO RPC
 * (`prepare().bind()` returns RpcPromise; DataCloneError). Org slug is the
 * completion marker, so callers must delete this org on mid-graph failure
 * or retry answers "already seeded" for a half-written graph.
 */
async function insertSeedGraph(
  db: AppEnv["Variables"]["db"],
  userId: string,
  organizationId: string
): Promise<"ok" | "empty"> {
  const parties = PARTIES.map((party) => ({
    id: crypto.randomUUID(),
    organizationId,
    ...party,
  }));
  const catalog = PRODUCTS.map((item) => ({
    id: crypto.randomUUID(),
    organizationId,
    ...item,
  }));

  const customer = parties[0];
  const widget = catalog[0];
  if (!(customer && widget)) {
    return "empty";
  }

  const documentId = crypto.randomUUID();

  await db.insert(organization).values({
    id: organizationId,
    name: SEED_ORG,
    slug: SEED_ORG_SLUG,
  });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: "owner",
  });
  await db.insert(entity).values(parties);
  await db.insert(product).values(catalog);
  await db.insert(document).values({
    id: documentId,
    organizationId,
    entityId: customer.id,
    entityNameSnapshot: customer.name,
    status: "finalized",
    number: 1,
    totalCents: ISSUED_QUANTITY * widget.unitPriceCents,
    issuedAt: new Date(),
  });
  await db.insert(documentLine).values({
    id: crypto.randomUUID(),
    documentId,
    productId: widget.id,
    nameSnapshot: widget.name,
    quantity: ISSUED_QUANTITY,
    unitPriceCents: widget.unitPriceCents,
  });
  return "ok";
}

/**
 * The response never echoes the password back. Whoever is allowed to call
 * this already knows it — they just sent it — so returning it would only add
 * a copy of a secret to a log somewhere.
 */
export const devRoutes = new Hono<AppEnv>().post(
  "/seed",
  requireSeedToken,
  jsonBody(seedSchema),
  async (c) => {
    const { password } = c.req.valid("json");
    const auth = c.get("auth");
    const db = c.get("db");
    const demoLogin = { email: SEED_EMAIL, organization: SEED_ORG };

    /**
     * The organization is the completion marker, not the account.
     *
     * Keying on the account would call a half-seeded app finished: the account
     * is created first, so any later failure would leave every retry answering
     * "already seeded" for an app with no organization and no rows, and nothing
     * short of a database reset could repair it.
     */
    const seededOrg = await db.query.organization.findFirst({
      where: eq(organization.slug, SEED_ORG_SLUG),
    });
    if (seededOrg) {
      return c.json({ seeded: false as const, ...demoLogin });
    }

    /**
     * `demo@example.com` belongs to the seed, not to a person. The app is
     * public from the moment it deploys and its sign-up page is open, so
     * anyone who knows the URL can claim that address before anyone seeds —
     * and the membership below would hand them ownership of the demo
     * organization along with whatever the app's real owner puts in it.
     *
     * Reusing the account outright is what would grant that, so the seed takes
     * the address back instead. Having joined an organization is what buys an
     * account out of that: it is the one shape a seed that died halfway could
     * not have produced, and the seed refuses rather than deleting it. An
     * account that has not — a squatter, a dead seed, or someone who signed up
     * and abandoned onboarding — is deleted, and the third case is why this is
     * a reclaim rather than a repair.
     *
     * The membership test is a condition on the delete rather than a check
     * before it. Split in two, an organization created in the gap would be
     * cascaded away by a delete that had already decided there was none.
     */
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, SEED_EMAIL),
    });
    if (existingUser) {
      const reclaimed = await db
        .delete(user)
        .where(
          and(
            eq(user.id, existingUser.id),
            notExists(
              db
                .select({ present: member.id })
                .from(member)
                .where(eq(member.userId, existingUser.id))
            )
          )
        )
        .returning({ id: user.id });

      if (reclaimed.length === 0) {
        return c.json(
          {
            error: "seed_email_in_use" as const,
            message: `${SEED_EMAIL} already belongs to an account that has joined an organization. Seeding would make it owner of ${SEED_ORG}, so it is refused.`,
          },
          409
        );
      }

      // Explicitly, rather than leaning on the cascade: foreign-key
      // enforcement is a connection pragma, and a leftover session row is a
      // credential that outlives the account it belonged to.
      //
      // Sequential awaits — drizzle `db.batch` cannot cross LOADER→AppDataDO
      // RPC (`prepare().bind()` returns RpcPromise; DataCloneError).
      await db.delete(session).where(eq(session.userId, existingUser.id));
      await db.delete(account).where(eq(account.userId, existingUser.id));
    }

    let organizationId: string | undefined;
    try {
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(password);
      const seedUser = await ctx.internalAdapter.createUser({
        email: SEED_EMAIL.toLowerCase(),
        name: SEED_NAME,
        emailVerified: false,
      });
      if (!seedUser) {
        return c.json(
          {
            error: "seed_user_create_failed" as const,
            message: "Failed to create demo user",
          },
          500
        );
      }
      await ctx.internalAdapter.linkAccount({
        userId: seedUser.id,
        providerId: "credential",
        accountId: seedUser.id,
        password: hash,
      });

      organizationId = crypto.randomUUID();
      const graph = await insertSeedGraph(db, seedUser.id, organizationId);
      if (graph === "empty") {
        await db
          .delete(organization)
          .where(eq(organization.id, organizationId));
        return c.json({ error: "seed_data_empty" as const }, 500);
      }

      return c.json({ seeded: true as const, ...demoLogin });
    } catch (err) {
      if (organizationId) {
        try {
          await db
            .delete(organization)
            .where(eq(organization.id, organizationId));
        } catch {
          // Best-effort: surface the original failure below.
        }
      }
      if (isAuthApiError(err)) {
        return c.json(
          {
            error: err.body?.code ?? ("auth_error" as const),
            message: err.body?.message ?? err.message ?? "Authentication error",
          },
          authErrorStatus(err.statusCode)
        );
      }
      return c.json(
        { error: "seed_failed" as const, message: seedErrorMessage(err) },
        500
      );
    }
  }
);
