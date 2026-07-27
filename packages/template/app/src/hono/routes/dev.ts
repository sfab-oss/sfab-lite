import { eq } from "drizzle-orm";
import { Hono } from "hono";
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

/**
 * The demo account every seeded app carries. Fixed rather than generated: the
 * factory shows these in the preview panel, and a value you can read off a
 * button beats one you have to go and look up.
 *
 * This is a demo login on a demo app, by design. If you take this app
 * somewhere real, delete this route — it is the only thing that knows the
 * password, and nothing else imports it.
 */
const SEED_EMAIL = "demo@example.com";
const SEED_PASSWORD = "demo-password";
const SEED_NAME = "Demo User";
const SEED_ORG = "Demo Company";
const SEED_ORG_SLUG = "demo-company";

/**
 * Sample rows, chosen so the app has something to show on every screen: two
 * parties, two products, and one document that is already issued so the
 * finalized state is visible without anyone having to build it first.
 */
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

/**
 * Development helpers. Seeding is idempotent — it answers with the same
 * credentials whether it just created the account or found it already there,
 * so the factory can call it at creation and you can call it again later
 * without a second account appearing.
 */
export const devRoutes = new Hono<AppEnv>().post("/seed", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");

  const existing = await db.query.user.findFirst({
    where: eq(user.email, SEED_EMAIL),
  });

  if (existing) {
    return c.json({
      seeded: false as const,
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      organization: SEED_ORG,
    });
  }

  // better-auth owns password hashing, so the account is created through its
  // API rather than by writing the `account` row directly.
  const created = await auth.api.signUpEmail({
    body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: SEED_NAME },
  });

  const organizationId = crypto.randomUUID();
  await db.insert(organization).values({
    id: organizationId,
    name: SEED_ORG,
    slug: SEED_ORG_SLUG,
  });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId: created.user.id,
    role: "owner",
  });

  const parties = await db
    .insert(entity)
    .values(
      PARTIES.map((party) => ({
        id: crypto.randomUUID(),
        organizationId,
        ...party,
      }))
    )
    .returning();

  const catalog = await db
    .insert(product)
    .values(
      PRODUCTS.map((item) => ({
        id: crypto.randomUUID(),
        organizationId,
        ...item,
      }))
    )
    .returning();

  const customer = parties[0];
  const widget = catalog[0];

  if (customer && widget) {
    const quantity = 3;
    const totalCents = quantity * widget.unitPriceCents;
    const documentId = crypto.randomUUID();

    await db.insert(document).values({
      id: documentId,
      organizationId,
      entityId: customer.id,
      entityNameSnapshot: customer.name,
      status: "finalized",
      number: 1,
      totalCents,
      issuedAt: new Date(),
    });
    await db.insert(documentLine).values({
      id: crypto.randomUUID(),
      documentId,
      productId: widget.id,
      nameSnapshot: widget.name,
      quantity,
      unitPriceCents: widget.unitPriceCents,
    });
  }

  return c.json({
    seeded: true as const,
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    organization: SEED_ORG,
  });
});
