import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import {
  document,
  documentLine,
  entity,
  member,
  organization,
  product,
  user,
} from "../../db/schema";
import type { AppEnv } from "../middleware";
import { jsonBody } from "../validate";

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

const seedSchema = z.object({
  password: z.string().min(12).max(200),
});

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
    const account = { email: SEED_EMAIL, organization: SEED_ORG };

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
      return c.json({ seeded: false as const, ...account });
    }

    // better-auth owns password hashing, so the account is created through its
    // API rather than by writing the `account` row. Reused when a previous
    // attempt got this far and then failed.
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, SEED_EMAIL),
    });
    const userId =
      existingUser?.id ??
      (
        await auth.api.signUpEmail({
          body: { email: SEED_EMAIL, password, name: SEED_NAME },
        })
      ).user.id;

    const organizationId = crypto.randomUUID();
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
      return c.json({ error: "seed_data_empty" as const }, 500);
    }

    const documentId = crypto.randomUUID();

    /**
     * One batch, so the sample graph either exists whole or not at all. A
     * document that committed without its line would be a finalized total with
     * nothing behind it — a state `routes/documents.ts` cannot produce, since
     * finalize requires a line and recomputes the total from the lines.
     */
    await db.batch([
      db.insert(organization).values({
        id: organizationId,
        name: SEED_ORG,
        slug: SEED_ORG_SLUG,
      }),
      db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role: "owner",
      }),
      db.insert(entity).values(parties),
      db.insert(product).values(catalog),
      db.insert(document).values({
        id: documentId,
        organizationId,
        entityId: customer.id,
        entityNameSnapshot: customer.name,
        status: "finalized",
        number: 1,
        totalCents: ISSUED_QUANTITY * widget.unitPriceCents,
        issuedAt: new Date(),
      }),
      db.insert(documentLine).values({
        id: crypto.randomUUID(),
        documentId,
        productId: widget.id,
        nameSnapshot: widget.name,
        quantity: ISSUED_QUANTITY,
        unitPriceCents: widget.unitPriceCents,
      }),
    ]);

    return c.json({ seeded: true as const, ...account });
  }
);
