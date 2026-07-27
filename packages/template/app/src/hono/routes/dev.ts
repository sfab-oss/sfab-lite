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

const credentials = {
  email: SEED_EMAIL,
  password: SEED_PASSWORD,
  organization: SEED_ORG,
};

export const devRoutes = new Hono<AppEnv>().post("/seed", async (c) => {
  const auth = c.get("auth");
  const db = c.get("db");

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
    return c.json({ seeded: false as const, ...credentials });
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
        body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: SEED_NAME },
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

  return c.json({ seeded: true as const, ...credentials });
});
